import type { CollectionConfig, Where } from 'payload'

import type { JobStageConfig } from '@/components/admin/JobStageView/stages'
import { jsonField } from '@/fields/jsonField'
import { getLocaleOptions } from '@/lib/locales'
import {
  TRANSCRIPT_PROVIDERS,
  TRANSCRIPT_STATUSES,
  TRANSCRIPTION_STALL_MS,
  transcriptSegmentsSchema,
} from '@/lib/meditations/transcript'
import type { PurgeWindow, RetentionConfig } from '@/types/retention'

import { applyGlossaryToSegments } from './hooks/applyGlossaryToSegments'
import { queueTranscription } from './hooks/queueTranscription'
import { deriveTranscriptStatus, loadTranscriptJob, transcriptJobError } from './status'

/**
 * How long an orphaned transcript is kept. A transcript is useless the moment
 * its meditation goes — nothing can read the cues or play the recording they
 * time — so the window is a grace period, not a retention promise.
 */
const ORPHAN_DAYS = 7

/**
 * The one window: a transcript whose meditation has gone.
 *
 * A hard delete of a meditation nulls `meditation` through its foreign key, so
 * a null parent is the orphan test. Nothing else reaches it — the sync hook on
 * `meditations` sets the parent at create and deletes the row outright when a
 * recording is replaced.
 *
 * ⚠ **`updatedAt` is the last app write, not the moment the parent went.** The
 * foreign key nulls the column in the database, so nothing bumps the timestamp
 * — an orphan last written over a week ago therefore goes on the next sweep,
 * and only a recently-written one waits out the rest of its week. That is the
 * safe direction: the grace period protects a transcript somebody is still
 * working on, and the row is worthless either way.
 */
export const ORPHAN_WINDOWS: PurgeWindow[] = [
  {
    days: ORPHAN_DAYS,
    name: 'orphanedTranscripts',
    where: (cutoff): Where => ({
      meditation: { exists: false },
      updatedAt: { less_than: cutoff },
    }),
  },
]

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
  // Retention is declared beside the window's own reason, and read by
  // `cleanupCollections` off the built config.
  custom: { retention: { windows: ORPHAN_WINDOWS } satisfies RetentionConfig },
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
