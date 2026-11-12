import type { CollectionConfig } from 'payload'

import { jsonField } from '@/fields/jsonField'
import { deleteChildren } from '@/lib/cascadeDeletion'
import { getLocaleOptions } from '@/lib/locales'
import { transcribableMedia } from '@/lib/transcripts/media'
import { readFileSubtitles } from '@/lib/transcripts/read'
import { syncTranscriptOnSave } from '@/lib/transcripts/sync'
import { subtitlesSchema } from '@/lib/utilities/subtitles'
import { restrictUploadToAdmin } from '@/plugins/access'
import { videoAdminThumbnail } from '@/plugins/storage/adminThumbnail'
import {
  hlsUrlField,
  mixedMediaUrlField,
  mp4UrlField,
  previewUrlField,
} from '@/plugins/storage/urlFields'
import { virtualFieldInputs } from '@/plugins/virtualFields'

import { fileTranscribe } from './endpoints/transcribe'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  trash: true,
  disableDuplicate: true,
  endpoints: [fileTranscribe],
  hooks: {
    beforeChange: [restrictUploadToAdmin({ label: 'file' })],
    afterChange: [syncTranscriptOnSave('files', 'spokenLanguage')],
    beforeDelete: [deleteChildren({ collection: 'transcripts', field: 'source' })],
  },
  admin: {
    group: 'Media',
    useAsTitle: 'filename',
    description:
      'Media files (images, audio, video) and PDFs used by other collections. A file nothing links to is moved to the trash automatically, and deleted for good after 45 days there.',
    defaultColumns: ['previewUrl', 'mimeType', 'createdAt'],
  },
  upload: {
    staticDir: 'media/files',
    mimeTypes: [
      'application/pdf',
      'audio/mpeg',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/vtt',
      'video/mp4',
      'video/mpeg',
    ],
    adminThumbnail: videoAdminThumbnail,
  },
  fields: [
    {
      name: 'createdAt',
      type: 'date',
      label: 'Uploaded At',
      admin: {
        readOnly: true,
      },
    },
    // url: direct file URL (mixed-media), hlsUrl: HLS manifest (videos),
    // mp4Url: MP4 download (videos), previewUrl: thumbnail
    mixedMediaUrlField({ collection: 'files' }),
    hlsUrlField({ collection: 'files' }),
    mp4UrlField({ collection: 'files' }),
    previewUrlField({ collection: 'files' }),
    jsonField({
      // The recording's transcript cues, wherever the file is used (#1016): a
      // Path Step's intro audio and panel videos read their subtitles here, in
      // the language the recording is spoken in. A virtual field rather than a
      // join, because a join on a populated upload answers bare ids at any
      // depth. Hidden, because the panel below shows the same cues.
      name: 'subtitles',
      schemaTitle: 'Subtitles',
      schema: subtitlesSchema,
      virtual: true,
      custom: virtualFieldInputs('mimeType'),
      admin: { hidden: true, readOnly: true },
      hooks: {
        afterRead: [
          // No `findMany` guard: a populated upload is read by a `find` too, and
          // that is the read the app needs. `readFileSubtitles` batches instead.
          ({ data, req }) =>
            transcribableMedia(data?.mimeType) && typeof data?.id === 'number'
              ? readFileSubtitles(req, data.id)
              : null,
        ],
      },
    }),
    {
      // The language the recording is in (#1016), which its transcript is made
      // in and a Path Step compares with the language being edited. Empty until
      // someone states it or the first run detects it, which writes it here.
      //
      // ⚠ **Admins alone change it after upload.** Every editor role holds
      // `files: create` and no `update` (`roles.ts`), so an editor states it on
      // upload and reads it after.
      name: 'spokenLanguage',
      type: 'select',
      options: getLocaleOptions(),
      admin: {
        // Before a file is chosen there is no type to judge by, so it shows.
        condition: (data) => !data?.mimeType || transcribableMedia(data.mimeType) !== null,
        description:
          'Leave it empty to detect it from the recording. Changing it transcribes the recording again, for every page that uses this file.',
      },
    },
    {
      name: 'transcriptPanel',
      type: 'ui',
      label: 'Transcript',
      admin: {
        components: { Field: '@/components/admin/TranscriptPanel#FileTranscriptField' },
      },
    },
  ],
}
