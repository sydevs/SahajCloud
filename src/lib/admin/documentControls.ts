import type { CollectionConfig, Config, GlobalConfig } from 'payload'

/**
 * Appends a component to the document controls of every entity a predicate
 * accepts, leaving the rest as they were.
 *
 * ⚠ **A global's slot sits under `components.elements`, a collection's under
 * `components.edit`.** `renderDocumentSlots` reads exactly those two paths, so
 * the other spelling type-checks, ships, and mounts nothing.
 *
 * `component` is a string path, not an import: Payload resolves
 * `admin.components` through the generated import map, and importing a client
 * component into a config would pull it into the server graph.
 *
 * `beforeDocumentControls` is **additive**, rendered unconditionally beside the
 * Save button, so what one plugin appends cannot displace an entity's own
 * component or another plugin's.
 */
export function appendDocumentControl(
  config: Config,
  options: {
    collections?: (collection: CollectionConfig) => boolean
    component: string
    globals?: (global: GlobalConfig) => boolean
  },
): Config {
  const { collections, component, globals } = options

  return {
    ...config,
    collections: config.collections?.map((collection) => {
      if (!collections?.(collection)) return collection

      const edit = collection.admin?.components?.edit

      return {
        ...collection,
        admin: {
          ...collection.admin,
          components: {
            ...collection.admin?.components,
            edit: {
              ...edit,
              beforeDocumentControls: [...(edit?.beforeDocumentControls ?? []), component],
            },
          },
        },
      }
    }),
    globals: config.globals?.map((global) => {
      if (!globals?.(global)) return global

      const elements = global.admin?.components?.elements

      return {
        ...global,
        admin: {
          ...global.admin,
          components: {
            ...global.admin?.components,
            elements: {
              ...elements,
              beforeDocumentControls: [...(elements?.beforeDocumentControls ?? []), component],
            },
          },
        },
      }
    }),
  }
}
