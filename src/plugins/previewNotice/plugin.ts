import type { Plugin } from 'payload'

/**
 * A string path, not an import: Payload resolves `admin.components` through the
 * generated import map, and importing a client component here would pull it
 * into the server config graph.
 */
export const LIVE_PREVIEW_NOTICE = '@/components/admin/LivePreviewNotice'

/**
 * Gives every live-preview surface the notice that says why its panel is blank,
 * so a new one is covered with nothing to declare.
 *
 * `beforeDocumentControls` is an additive slot rendered beside the Save button
 * and inside `LivePreviewProvider` (`@payloadcms/next/dist/views/Document`), so
 * the watcher reads the panel's own state with no field to mount and no
 * `previewTargetField` to declare — which `pages`, `lectures`, `events` and
 * `regions` do not have.
 *
 * ⚠ **A global's slot sits under `components.elements`, a collection's under
 * `components.edit`.** `renderDocumentSlots` reads exactly those two, so the
 * other spelling type-checks, ships, and mounts nothing.
 *
 * Registered late in `plugins`, so a `livePreview` another plugin declared is
 * seen too — `user-submissions` gets its own from the form-builder plugin.
 */
export const previewNoticePlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => {
    if (!collection.admin?.livePreview) return collection

    const edit = collection.admin.components?.edit

    return {
      ...collection,
      admin: {
        ...collection.admin,
        components: {
          ...collection.admin.components,
          edit: {
            ...edit,
            beforeDocumentControls: [...(edit?.beforeDocumentControls ?? []), LIVE_PREVIEW_NOTICE],
          },
        },
      },
    }
  }),
  globals: config.globals?.map((global) => {
    if (!global.admin?.livePreview) return global

    const elements = global.admin.components?.elements

    return {
      ...global,
      admin: {
        ...global.admin,
        components: {
          ...global.admin.components,
          elements: {
            ...elements,
            beforeDocumentControls: [
              ...(elements?.beforeDocumentControls ?? []),
              LIVE_PREVIEW_NOTICE,
            ],
          },
        },
      },
    }
  }),
})
