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
import { virtualFieldInputs } from '@/plugins/virtualFields'

import { applyGlossaryToSegments } from './hooks/applyGlossaryToSegments'
import { queueTranscription } from './hooks/queueTranscription'
import { stampSegmentCount } from './hooks/stampSegmentCount'
import { deriveTranscriptStatus, loadTranscriptJob, transcriptJobError } from './status'

/**
 * The timestamped cues of one recording, one row per source.
 *
 * Kept off the source itself: Meditations carries drafts and keeps three
 * versions, so a job writing there would push out the versions an editor
 * restores from, and would race their draft. It sits in the two projects that
 * carry `meditations` (`config/projects.ts`), so whoever may read a recording
 * may read its transcript — there is no second **read** permission to hold.
 *
 * Nor is there a write grant here. The one write an editor can ask for is
 * `POST /api/meditations/:id/transcribe` (#984), which gates on
 * `meditations: update` and writes these rows with `overrideAccess`, so the
 * authority to re-transcribe stays the authority to edit the meditation.
 *
 * A row lives exactly as long as its source: `deleteChildren` on `meditations`
 * and on `files` takes it before the parent row goes, so no source-less row can
 * exist and there is no orphan window to sweep. Trashing a parent is an
 * `update`, so a trashed one keeps its transcript until the permanent delete.
 */
export const Transcripts: CollectionConfig = {
  slug: 'transcripts',
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
    beforeChange: [applyGlossaryToSegments, stampSegmentCount],
  },
  fields: [
    {
      // Polymorphic, so one value states exactly-one-of and `required` is that
      // rule: there is no second column for "both" to fill. It costs no
      // `NOT NULL` either — the value lives in `transcripts_rels`, not in a
      // column here — and `unique` becomes one `UNIQUE(<target>_id, path)` per
      // target there, so one transcript per meditation and per file both hold.
      //
      // ⚠ **Query it as `{ source: { equals: { relationTo, value } } }`, the
      // one spelling Payload resolves.** `Where` is loosely typed, so two
      // wrong ones compile and fail only at run time: a bare `source` throws
      // `APIError('Not supported')` when the query is built, and
      // `source.value` ORs one raw id column per target, matching meditation 5
      // **or** file 5.
      name: 'source',
      type: 'relationship',
      relationTo: ['meditations', 'files'],
      required: true,
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
      // How many cues `segments` holds, written by `stampSegmentCount` on every
      // write that names the column. It exists so `status` can be derived
      // without co-selecting the cues — see that hook, and `status.ts`.
      name: 'segmentCount',
      type: 'number',
      admin: { hidden: true, readOnly: true },
    },
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
      // Derived on read, so a `select` naming it without these made every
      // finished transcript read `failed` (#1084). It reads the stored count
      // rather than the cues, so a reader asking whether a transcript is ready
      // is not served the whole `segments` column to hear it.
      custom: virtualFieldInputs('segmentCount', 'job'),
      options: [...TRANSCRIPT_STATUSES],
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          async ({ data, req }) =>
            deriveTranscriptStatus(data?.segmentCount, await loadTranscriptJob(req, data?.job)),
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
      custom: virtualFieldInputs('job'),
      admin: { readOnly: true },
      hooks: {
        afterRead: [
          async ({ data, req }) => transcriptJobError(await loadTranscriptJob(req, data?.job)),
        ],
      },
    },
  ],
}
