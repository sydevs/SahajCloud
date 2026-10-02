import type { CollectionConfig } from 'payload'

import { jsonField } from '@/fields/jsonField'
import {
  TRANSCRIPT_PROVIDERS,
  TRANSCRIPT_STATUSES,
  transcriptSegmentsSchema,
} from '@/lib/meditations/transcript'

/**
 * The timestamped transcript of a meditation's recording, one row per
 * meditation.
 *
 * Kept off the meditation itself: Meditations carries drafts and keeps three
 * versions, so a job writing there would push out the versions an editor
 * restores from, and would race their draft. Editors reach this data only
 * through `GET`/`POST /api/meditations/:id/transcript`, which check meditation
 * permissions. The collection itself is restricted (`config/projects.ts`), so
 * its REST routes answer admins alone.
 */
export const MeditationTranscripts: CollectionConfig = {
  slug: 'meditation-transcripts',
  admin: {
    hidden: true,
    useAsTitle: 'audioFilename',
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
      name: 'language',
      type: 'text',
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
