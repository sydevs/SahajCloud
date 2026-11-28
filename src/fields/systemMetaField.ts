import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { jsonField } from './jsonField'

/**
 * The namespaced home for system-managed, non-editable, **non-indexable** values
 * on a document — vote tallies, counters, anything a hook maintains that nothing
 * needs to `where` on. Add a namespace here rather than a column.
 *
 * The shape is a **JSON Schema**, which is what makes this safe to read with no
 * hand-written guard: Payload generates the exact TypeScript type into
 * `payload-types.ts`, and validates on write, so a mistyped value throws rather
 * than landing in the column.
 *
 * Never writable through the API, by anyone. System writers pass
 * `overrideAccess`, which skips field access entirely; for everyone else
 * Payload *deletes the key from the incoming patch* rather than nulling the
 * column (`beforeValidate/promise.js`), so a save that never rendered the field
 * cannot wipe it.
 */
export function systemMetaField(options: {
  /** Names the generated interface in `payload-types.ts`, and derives the schema's URI. */
  schemaTitle: string
  /** One entry per namespace, e.g. `{ communityFeedback: { … } }`. */
  namespaces: Record<string, JSONSchema4>
  /** Extra admin config merged over the defaults (e.g. `condition`). */
  admin?: JSONField['admin']
}): JSONField {
  return jsonField({
    name: 'systemMeta',
    schemaTitle: options.schemaTitle,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: options.namespaces,
    },
    access: { update: () => false },
    admin: {
      readOnly: true,
      description: 'System-managed metadata. Written by hooks, never by hand.',
      ...options.admin,
    },
  })
}
