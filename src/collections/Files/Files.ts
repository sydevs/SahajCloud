import type { CollectionConfig } from 'payload'

import { jsonField } from '@/fields/jsonField'
import { deleteChildren } from '@/lib/cascadeDeletion'
import { transcribableMedia } from '@/lib/transcripts/media'
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
import { subtitlesFromTranscript } from './hooks/subtitlesFromTranscript'
import { syncFileTranscript } from './hooks/syncFileTranscript'

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
    afterChange: [syncFileTranscript],
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
      // the language the recording is spoken in. Hidden, because the panel
      // below shows the same cues as a person reads them.
      name: 'subtitles',
      schemaTitle: 'Subtitles',
      schema: subtitlesSchema,
      virtual: true,
      custom: virtualFieldInputs('mimeType'),
      admin: { hidden: true, readOnly: true },
      hooks: { afterRead: [subtitlesFromTranscript] },
    }),
    {
      name: 'transcriptPanel',
      type: 'ui',
      label: 'Transcript',
      admin: {
        // Only a saved audio or video file has a transcript to show.
        condition: (data) => Boolean(data?.id) && transcribableMedia(data?.mimeType) !== null,
        components: { Field: '@/components/admin/RecordingTranscript#FileTranscriptField' },
      },
    },
  ],
}
