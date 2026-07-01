import type { CollectionConfig, JSONField, Validate } from 'payload'

import { hideUntilCreated, mediaField } from '@/fields'
import { LOCALES } from '@/lib/locales'
import {
  getFrameDiagnosticsLogContext,
  hasFrameNormalizationIssues,
  normalizeMeditationFrames,
  normalizeMeditationFramesForStorage,
} from '@/lib/meditations/frames'
import { restrictUploadToAdmin } from '@/plugins/access'
import { virtualUrlField } from '@/plugins/storage/urlFields'
import { KeyframeData } from '@/types/frames'

import { meditationLectures } from './endpoints/lectures'
import { meditationSongs } from './endpoints/songs'
import { extractAudioDuration } from './hooks/extractAudioDuration'
import { fallbackTitleAfterRead } from './hooks/fallbackTitle'
import { filterMeditationsByLocale } from './hooks/filterMeditationsByLocale'
import { invalidateMeditationNodeWeights } from './hooks/invalidateMeditationNodeWeights'
import { recomputeMeditationNodeWeights } from './hooks/recomputeMeditationNodeWeights'

/**
 * Factory for afterRead hooks that find UserChoices referencing this meditation
 * for a specific timing field. Returns an array of { id, title } objects.
 *
 * @deprecated Workaround for a PayloadCMS bug — replace with native join fields
 * when fixed. See https://github.com/sydevs/SahajCloud/issues/249
 *
 * PayloadCMS's `docWithFilenameExists` calls `db.findOne()` without passing
 * `locale`, which breaks join subqueries that target localized relationships
 * on upload collections. This factory emulates join fields using virtual JSON
 * fields with afterRead hooks.
 *
 * Each call maps 1:1 to this native join field config:
 *   { type: 'join', collection: 'user-choices', on: '<onField>' }
 */
const virtualJoinField = ({ name, on }: { name: string; on: string }): JSONField => ({
  name,
  type: 'json',
  virtual: true,
  admin: {
    readOnly: true,
    // Like a real join, this resolves nothing until the doc exists — hide on create.
    condition: hideUntilCreated,
    components: { Field: '@/components/admin/TagAssignmentField' },
  },
  hooks: {
    afterRead: [
      async ({ data, req }) => {
        if (!data?.id) return []
        try {
          const result = await req.payload.find({
            collection: 'user-choices',
            where: { [on]: { equals: data.id }, isParent: { not_equals: true } },
            select: { title: true },
            locale: req.locale || 'en',
            depth: 0,
            limit: 50,
          })
          return result.docs.map((tag) => ({ id: tag.id, title: tag.title }))
        } catch (error) {
          req.payload.logger.warn({
            msg: `Failed to fetch tag assignments for meditation ${data.id}`,
            field: on,
            error: error instanceof Error ? error.message : String(error),
          })
          return []
        }
      },
    ],
  },
})

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  trash: true,
  endpoints: [meditationLectures, meditationSongs],
  hooks: {
    beforeOperation: [filterMeditationsByLocale],
    beforeChange: [
      restrictUploadToAdmin({ label: 'audio file on a meditation' }),
      extractAudioDuration,
      invalidateMeditationNodeWeights,
    ],
    afterChange: [recomputeMeditationNodeWeights],
  },
  defaultPopulate: {
    // Exclude the expensive per-row afterRead virtual fields when a meditation
    // is hydrated through a relationship (depth ≥ 1): `tagAssignments` fires
    // ~4 user-choices queries/row and `frames` fires a frames query/row —
    // neither is needed by relationship consumers. See issue #529 (Phase 3).
    tagAssignments: false,
    frames: false,
  },
  versions: {
    maxPerDoc: 3,
    drafts: {
      schedulePublish: true,
    },
  },
  upload: {
    staticDir: 'media/meditations',
    bulkUpload: false,
    // No `hideRemoveFile`: replacing audio requires the native remove button to
    // reveal the dropzone. Removal-without-replacement and non-admin replacement
    // are both blocked server-side by restrictUploadToAdmin.
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'label',
    // Restrict the admin list query to the active columns' fields so the
    // expensive per-row afterRead hooks on unselected fields (frames,
    // tagAssignments) never run on a list load. See #459.
    enableListViewSelectAPI: true,
    // `duration` is hidden and never rendered as a column, but it must be
    // selected so the `durationMinutes` virtual column — whose afterRead
    // derives minutes from `duration` — still computes under the list select.
    defaultColumns: ['label', 'thumbnail', '_status', 'type', 'durationMinutes', 'duration'],
    livePreview: {
      url: ({ data }) => {
        const baseURL = process.env.WEMEDITATE_WEB_URL
        return `${baseURL}/${data.locale}/preview/embed?collection=meditations&id=${data.id}&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}`
      },
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
      ],
    },
    components: {
      edit: {
        PublishButton: '@/components/admin/buttons/UpdateOnlyPublishButton',
        SaveDraftButton: '@/components/admin/buttons/NextStepButton',
        Upload: '@/components/admin/AudioUpload',
      },
    },
  },
  fields: [
    // Virtual URL field generated by factory function
    // See src/plugins/storage/urlFields.ts for implementation details
    virtualUrlField({ collection: 'meditations', adapter: 'r2' }),
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'label',
              type: 'text',
              label: 'Internal Name',
              required: true,
            },
            {
              name: 'locale',
              type: 'select',
              options: LOCALES.map((locale) => ({
                label: locale.label,
                value: locale.code,
              })),
              defaultValue: ({ locale }: { locale?: string }) => locale || 'en',
              required: true,
              // `filterMeditationsByLocale` appends `{ locale: { equals } }` to
              // every find/count, so this column is filtered on every admin list
              // load — index it to keep list/pagination queries off a seq scan.
              // See issue #529 (Phase 3). Needs a migration (dev/test use push).
              index: true,
              admin: {
                hidden: true,
              },
              access: {
                update: () => false,
              },
            },
            {
              name: 'narrator',
              type: 'relationship',
              relationTo: 'narrators',
              required: true,
              admin: {
                description:
                  'This should be the name of the yogi who did the recording. We need this for dynamic followup audio clips. Cannot be changed after creation.',
              },
              access: {
                // Narrator can only be set during creation, not update
                // This simplifies frame caching since narrator won't change during editing
                // TODO: Updated should be disabled again once legacy meditations have had their narrator updated
                //update: () => false,
              },
              validate: ((value, options) => {
                // Only required during update
                const isUpdate = options.operation === 'update' || !!options.id
                if (isUpdate && !value) {
                  return 'Narrator is required'
                }
                return true
              }) as Validate,
            },
            {
              name: 'songTag',
              type: 'relationship',
              relationTo: 'song-tags',
              admin: {
                condition: ({ id }) => !!id,
                description: 'Music with this tag will be offered to the seeker',
                components: {
                  Field: '@/components/admin/TagSelector',
                },
              },
            },
            {
              name: 'duration',
              type: 'number',
              label: 'Duration (seconds)',
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              // Cached `{ slug → on-screen seconds }` map for the meditation's
              // frames. Drives the topical-overlap ranking in
              // `/api/meditations/:id/related-lectures`. Recomputed by the
              // `recomputeMeditationNodeWeights` afterChange hook on Meditations
              // and cascaded from Frames via `cascadeFrameNodeChange`.
              name: 'subtleSystemNodeWeights',
              type: 'json',
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              name: 'durationMinutes',
              type: 'number',
              label: 'Duration (minutes)',
              virtual: true,
              admin: {
                readOnly: true,
                hidden: true,
              },
              hooks: {
                afterRead: [
                  ({ data }) => {
                    if (data?.duration && typeof data.duration === 'number') {
                      return Math.ceil(data.duration / 60)
                    }
                    return null
                  },
                ],
              },
            },
          ],
        },
        {
          label: 'Publishing',
          admin: {
            condition: ({ id }) => !!id,
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'Public Title',
              // Optional auto-generated fallback derived from the dominant
              // subtle-system node (see ./hooks/fallbackTitle). Virtual: no DB
              // column, computed on read, so it can't be set or queried.
              virtual: true,
              admin: {
                readOnly: true,
                description:
                  "Optional auto-generated fallback title (e.g. Meditation for Anahat), derived from this meditation's dominant subtle-system node. Front-end clients use it only when they have no composed label of their own.",
              },
              hooks: {
                afterRead: [fallbackTitleAfterRead],
              },
            },
            {
              ...mediaField({
                name: 'thumbnail',
                required: false, // Conditionally required via validation
                tagName: 'meditation',
              }),
              validate: ((value, options) => {
                // Only required during update
                const isUpdate = options.operation === 'update' || !!options.id
                if (isUpdate && !value) {
                  return 'Thumbnail is required'
                }
                return true
              }) as Validate,
            },
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'daily',
              options: [
                { label: 'Daily', value: 'daily' },
                { label: 'Path', value: 'lesson' },
              ],
              admin: {
                custom: {
                  descriptions: {
                    daily:
                      'Personalized meditations with interactive features. Offered based on seeker mood/state.',
                    lesson:
                      'Meditations that complement Path lessons. Not shown in daily recommendations.',
                  },
                },
                components: {
                  Field: '@/components/admin/ToggleGroupField',
                  Description: '@/components/admin/SelectDescription',
                },
              },
            },
            {
              name: 'tagAssignments',
              type: 'group',
              label: 'Category Assignments',
              admin: {
                condition: ({ id }) => !!id,
                description:
                  'Shows which categories use this meditation for each time of day. Managed from the Categories collection.',
                // Each virtualJoinField subfield runs a user-choices query per row.
                disableListColumn: true,
                disableListFilter: true,
              },
              fields: [
                virtualJoinField({ name: 'asMorningMeditation', on: 'morningMeditation' }),
                virtualJoinField({ name: 'asAfternoonMeditation', on: 'afternoonMeditation' }),
                virtualJoinField({ name: 'asEveningMeditation', on: 'eveningMeditation' }),
                virtualJoinField({ name: 'asNightMeditation', on: 'nightMeditation' }),
              ],
            },
          ],
        },
        {
          label: 'Video',
          admin: {
            condition: ({ id }) => !!id,
          },
          fields: [
            {
              type: 'tabs',
              tabs: [
                {
                  label: 'Frames',
                  description: 'Remove or re-order frames',
                  fields: [
                    {
                      name: 'frames',
                      type: 'json',
                      admin: {
                        // afterRead runs a frames query per row to enrich keyframes.
                        disableListColumn: true,
                        disableListFilter: true,
                        components: {
                          Field: '@/components/admin/FrameEditor/FrameListManager',
                        },
                      },
                      validate: ((value, options) => {
                        // Only required during update (not on create)
                        const isUpdate = options.operation === 'update' || !!options.id
                        const valueToValidate = value === undefined ? options.previousValue : value
                        const { frames } = normalizeMeditationFrames(valueToValidate)
                        if (isUpdate && frames.length === 0) {
                          return 'At least one frame is required'
                        }
                        return true
                      }) as Validate,
                      hooks: {
                        beforeChange: [
                          async ({ data, operation, req, value }) => {
                            if (value === undefined) return undefined

                            const normalized = normalizeMeditationFrames(value)
                            if (hasFrameNormalizationIssues(normalized.diagnostics)) {
                              req.payload.logger.warn({
                                msg: 'Dropped malformed meditation frames before save',
                                issue: '390',
                                meditationId: data?.id,
                                operation,
                                status: data?._status,
                                ...getFrameDiagnosticsLogContext(normalized),
                              })
                            }

                            return normalizeMeditationFramesForStorage(value)
                          },
                        ],
                        afterRead: [
                          async ({ value, req }) => {
                            const { frames } = normalizeMeditationFrames(value)

                            const frameIds = frames.map((f) => f.id)
                            if (frameIds.length === 0) return []

                            try {
                              const frameDocs = await req.payload.find({
                                collection: 'frames',
                                where: { id: { in: frameIds } },
                                limit: frameIds.length,
                              })

                              // Create map of relevant frame data
                              const frameMap = Object.fromEntries(
                                frameDocs.docs.map((frame) => [frame.id, frame]),
                              )

                              // Add data to each frame and sort by timestamp
                              return frames.map((v) => {
                                return {
                                  ...v,
                                  ...frameMap[v.id],
                                  timestamp: Math.round(v.timestamp),
                                } as KeyframeData
                              })
                            } catch (error) {
                              // If frames have thumbnails that reference deleted media, gracefully skip frame enrichment
                              // This can happen during import operations with --reset when media is deleted
                              req.payload.logger.warn({
                                msg: 'Failed to enrich frame data for meditation',
                                frameCount: frames.length,
                                frameIds: frameIds.slice(0, 5), // Log first 5 IDs to avoid too much data
                                error: error instanceof Error ? error.message : String(error),
                              })

                              // Return basic frame data without enrichment
                              return frames.map((v) => ({
                                ...v,
                                timestamp: Math.round(v.timestamp),
                              })) as KeyframeData[]
                            }
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  label: 'Add New',
                  description: 'Add new frames to the meditation',
                  fields: [
                    {
                      name: 'frameInserter',
                      type: 'ui',
                      admin: {
                        components: {
                          Field: '@/components/admin/FrameEditor/FrameInserter',
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
