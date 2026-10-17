import type { CollectionConfig } from 'payload'

import type { JobStageConfig } from '@/components/admin/JobStageView/stages'
import { jsonField } from '@/fields/jsonField'
import { getLocaleOptions } from '@/lib/locales'
import {
  TRANSCRIPT_PROVIDERS,
  TRANSCRIPT_STATUSES,
  TRANSCRIPTION_STALL_MS,
  transcriptSegmentsSchema,
} from '@/lib/meditations/transcript'

import { applyGlossaryToSegments } from './hooks/applyGlossaryToSegments'

/**
 * The timestamped transcript of a meditation's recording, one row per
 * meditation.
 *
 * Kept off the meditation itself: Meditations carries drafts and keeps three
 * versions, so a job writing there would push out the versions an editor
 * restores from, and would race their draft. The collection is restricted
 * (`config/projects.ts`), so no API client key reads it and no manager role
 * grants it — the editor-facing read is a later child's endpoint, gated on
 * meditation permissions.
 */
export const MeditationTranscripts: CollectionConfig = {
  slug: 'meditation-transcripts',
  admin: {
    components: {
      views: {
        edit: { default: { Component: '@/components/admin/JobStageView/JobStageView' } },
      },
    },
    // `processing` alone, never `queued`: that is the `status` default below,
    // so naming it would hold every newly created row behind the waiting view
    // with nothing to move it on. A queued row holds no worker's lease.
    // `staleAfterMs` is the same window the transcript tab calls stalled, so a
    // run lost to a restart does not hold the row behind the waiting view for
    // good — past it the form opens and `status: queued` requests it again.
    custom: {
      jobStage: {
        runningStages: ['processing'],
        staleAfterMs: TRANSCRIPTION_STALL_MS,
      } satisfies JobStageConfig,
    },
    hidden: true,
    useAsTitle: 'audioFilename',
  },
  hooks: {
    beforeChange: [applyGlossaryToSegments],
  },
  fields: [
    {
      // Not `required`: Payload makes a required relationship NOT NULL, and
      // hard-deleting a meditation nulls this column through its foreign key.
      name: 'meditation',
      type: 'relationship',
      relationTo: 'meditations',
      unique: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [...TRANSCRIPT_STATUSES],
    },
    {
      // The recording this transcript was requested for. A meditation whose
      // `filename` differs has had its audio replaced since.
      name: 'audioFilename',
      type: 'text',
    },
    {
      name: 'provider',
      type: 'select',
      options: [...TRANSCRIPT_PROVIDERS],
    },
    {
      // A required `select`, not free text: the glossary pass keys on this
      // value, and a code no entry can match — or none at all — would disable
      // it silently (#897, line 8). Every writer has one, because a
      // meditation's own `locale` is required.
      name: 'language',
      type: 'select',
      required: true,
      options: getLocaleOptions(),
    },
    {
      // Stored rather than compared at render: the mark belongs to the moment
      // the recording is replaced, and a render-time comparison of filenames is
      // meaningless across environments, where a preview key prefixes them.
      name: 'outdated',
      type: 'checkbox',
      defaultValue: false,
    },
    jsonField({
      // Cleared to `null` when a new transcription is requested, so the
      // generated type has to carry it.
      name: 'segments',
      schemaTitle: 'TranscriptSegments',
      schema: transcriptSegmentsSchema.nullable(),
    }),
    {
      name: 'error',
      type: 'textarea',
    },
  ],
}
