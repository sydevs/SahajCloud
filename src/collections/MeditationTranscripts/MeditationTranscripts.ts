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
import type { RetentionExclusion } from '@/lib/retention'

import { applyGlossaryToSegments } from './hooks/applyGlossaryToSegments'
import { queueTranscription } from './hooks/queueTranscription'
import { deriveTranscriptStatus, loadTranscriptJob, transcriptJobError } from './status'

/**
 * The timestamped transcript of a meditation's recording, one row per
 * meditation.
 *
 * Kept off the meditation itself: Meditations carries drafts and keeps three
 * versions, so a job writing there would push out the versions an editor
 * restores from, and would race their draft. It sits in the two projects that
 * carry `meditations` (`config/projects.ts`), so whoever may read a recording
 * may read its transcript — there is no second **read** permission to hold.
 *
 * Nor is there a write grant here. The one write an editor can ask for is
 * `POST /api/meditations/:id/transcribe` (#984), which gates on
 * `meditations: update` and writes these rows with `overrideAccess`, so the
 * authority to re-transcribe stays the authority to edit the meditation.
 */
export const MeditationTranscripts: CollectionConfig = {
  slug: 'meditation-transcripts',
  // ⚠ The other answer `cleanupCollections` reads off a collection: no windows,
  // and the reason. A collection declaring neither is an open question (#987).
  custom: {
    retention: {
      excluded:
        'No window chosen yet. A hard delete of a meditation nulls a transcript parent, and the orphan then keeps the full spoken word and its R2 key with nothing able to read it. How long that may last is a policy decision, not a refactor (#987).',
    } satisfies RetentionExclusion,
  },
  admin: {
    components: {
      views: {
        edit: { default: { Component: '@/components/admin/JobStageView/JobStageView' } },
      },
    },
    // `processing` is every wait: a row waiting on a worker and one held by it
    // are indistinguishable to a reader, so `status` spells neither separately.
    // `staleAfterMs` releases the gate on a run lost to a restart, which would
    // otherwise hold the row behind the waiting view for good — the job row it
    // derives from stays incomplete with nothing left to finish it.
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
    afterChange: [queueTranscription],
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
    jsonField({
      // Null until the run completes, so the generated type has to carry it.
      // There is no second state to tell apart: a replaced recording takes its
      // row with it, so cues on a row are always this recording's.
      name: 'segments',
      schemaTitle: 'TranscriptSegments',
      schema: transcriptSegmentsSchema.nullable(),
    }),
    {
      // The run, kept so a reader can see what happened to it.
      // `deleteJobOnComplete` is off for this reason (`payload.config.ts`).
      //
      // `maxDepth: 0` never populates it: `payload-jobs` is admin-only, and a
      // client reading a recording reads its transcript, so the row must carry
      // the id and nothing more. The two virtual fields below read the job
      // themselves, with `overrideAccess`.
      name: 'job',
      type: 'relationship',
      relationTo: 'payload-jobs',
      maxDepth: 0,
      admin: { hidden: true },
    },
    {
      name: 'status',
      type: 'select',
      virtual: true,
      options: [...TRANSCRIPT_STATUSES],
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          async ({ data, req }) =>
            deriveTranscriptStatus(data?.segments, await loadTranscriptJob(req, data?.job)),
        ],
      },
    },
    {
      // The run's own message. Read off the job rather than copied onto the
      // row: a copy is a second statement of the same failure, and the one that
      // goes stale.
      name: 'error',
      type: 'textarea',
      virtual: true,
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          async ({ data, req }) => transcriptJobError(await loadTranscriptJob(req, data?.job)),
        ],
      },
    },
  ],
}
