import type { CollectionConfig } from 'payload'

import { jsonField } from '@/fields/jsonField'
import { getLocaleOptions } from '@/lib/locales'
import {
  TRANSCRIPT_PROVIDERS,
  TRANSCRIPT_STATUSES,
  transcriptSegmentsSchema,
} from '@/lib/meditations/transcript'

import { applyGlossaryToSegments } from './hooks/applyGlossaryToSegments'

/**
 * The timestamped transcript of a meditation's recording, one row per
 * meditation.
 *
 * Kept off the meditation itself: Meditations carries drafts and keeps three
 * versions, so a job writing there would push out the versions an editor
 * restores from, and would race their draft. It sits in the two projects that
 * carry `meditations` (`config/projects.ts`), so whoever may read a recording
 * may read its transcript — there is no second permission to hold, and no
 * endpoint standing in for one.
 */
export const MeditationTranscripts: CollectionConfig = {
  slug: 'meditation-transcripts',
  admin: {
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
      // Null until the first run completes, so the generated type has to carry
      // it. A later request leaves the cues alone — the previous recording's
      // text stays readable, with `outdated` saying whose it is.
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
