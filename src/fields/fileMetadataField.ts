import type { JSONField } from 'payload'

import { z } from 'zod'

import { jsonField } from './jsonField'

/**
 * The sidebar `fileMetadata` column shared by the four upload collections
 * (Frames, Images, Songs, Videos). Written only by the storage adapters and the
 * seed importers — never by an editor, never by an API client.
 *
 * **The shape stays open on purpose.** Both Cloudflare adapters build it by
 * spreading whatever the row already held and adding `originalFilename`
 * (`cloudflareImagesAdapter.ts`, `cloudflareStreamAdapter.ts`), so a row
 * imported under an earlier shape keeps its extra keys. Payload validates on
 * every save, including one that never touched this column, so
 * `additionalProperties: false` would make such a row unsaveable rather than
 * catch a bug. Declaring the one key every writer sets still buys the generated
 * type, which is what `BaseImporter` and `MediaUploader` read.
 */
export function fileMetadataField(options: { description?: string } = {}): JSONField {
  return jsonField({
    name: 'fileMetadata',
    schemaTitle: 'FileMetadata',
    schema: z.looseObject({
      originalFilename: z
        .string()
        .optional()
        .describe('The filename as uploaded, before the adapter replaced it with a provider id.'),
    }),
    defaultValue: {},
    admin: {
      position: 'sidebar',
      readOnly: true,
      ...(options.description ? { description: options.description } : {}),
    },
  })
}
