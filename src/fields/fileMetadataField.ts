import type { JSONField } from 'payload'

export const FILE_METADATA_SCHEMA_URI = 'https://sahajcloud.dev/schemas/file-metadata.json'

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
export function fileMetadataField(
  options: { defaultEmpty?: boolean; description?: string } = {},
): JSONField {
  return {
    name: 'fileMetadata',
    type: 'json',
    ...(options.defaultEmpty ? { defaultValue: {} } : {}),
    jsonSchema: {
      uri: FILE_METADATA_SCHEMA_URI,
      fileMatch: [FILE_METADATA_SCHEMA_URI],
      schema: {
        $id: FILE_METADATA_SCHEMA_URI,
        title: 'FileMetadata',
        type: 'object',
        additionalProperties: true,
        properties: {
          originalFilename: {
            type: 'string',
            description:
              'The filename as uploaded, before the adapter replaced it with a provider id.',
          },
        },
      },
    },
    admin: {
      position: 'sidebar',
      readOnly: true,
      ...(options.description ? { description: options.description } : {}),
    },
  }
}
