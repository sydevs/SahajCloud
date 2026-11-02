import type { CollectionConfig } from 'payload'

import { deleteChildren } from '@/lib/cascadeDeletion'
import { restrictUploadToAdmin } from '@/plugins/access'
import { videoAdminThumbnail } from '@/plugins/storage/adminThumbnail'
import {
  hlsUrlField,
  mixedMediaUrlField,
  mp4UrlField,
  previewUrlField,
} from '@/plugins/storage/urlFields'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  trash: true,
  disableDuplicate: true,
  hooks: {
    beforeChange: [restrictUploadToAdmin({ label: 'file' })],
    // A transcript's cues are useless without the recording they time, and
    // `transcripts.source` is `required` — so the row has to go before the file
    // does, or the rels foreign key leaves it with no source and the admin can
    // neither load nor save it. Trashing a file is an `update` and so keeps it.
    beforeDelete: [
      deleteChildren({ collection: 'transcripts', field: 'source', relationTo: 'files' }),
    ],
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
  ],
}
