import type { Config } from 'payload'

/**
 * The component the plugin wires. A string path, not an import: Payload
 * resolves `admin.components` through the generated import map, and importing
 * a client component here would pull it into the server config graph.
 */
export const UPLOAD_WITH_NOTICE = '@/components/admin/UploadNotice'

/**
 * Gives every upload collection the uploading notice, so a new one cannot ship
 * without feedback during a multipart save (#888).
 *
 * Coverage is the point: wiring `edit.Upload` per collection is a step someone
 * forgets, which is how the admin who reported #888 waited on a frozen page.
 * A collection that already names its own Upload component is left alone and
 * composes `<UploadNotice />` itself — overriding it would drop the audio
 * player and the frame-drift banner.
 *
 * Register before `accessPlugin`, which must stay last.
 */
export function uploadNoticePlugin(config: Config): Config {
  return {
    ...config,
    collections: config.collections?.map((collection) => {
      if (!collection.upload) return collection
      if (collection.admin?.components?.edit?.Upload) return collection

      return {
        ...collection,
        admin: {
          ...collection.admin,
          components: {
            ...collection.admin?.components,
            edit: {
              ...collection.admin?.components?.edit,
              Upload: UPLOAD_WITH_NOTICE,
            },
          },
        },
      }
    }),
  }
}
