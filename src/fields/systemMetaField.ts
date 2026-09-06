import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

/**
 * A `systemMeta` JSON field: the namespaced home for system-managed,
 * non-editable, **non-indexable** values on a document — vote tallies, counters,
 * anything a hook maintains that nothing needs to `where` on. Add a namespace
 * here rather than a column.
 *
 * The shape is declared as a **JSON Schema**, which is what makes this safe to
 * read without a hand-written guard:
 *
 * - Payload generates the exact TypeScript type into `payload-types.ts`, so
 *   `event.systemMeta?.communityFeedback?.denials` is checked at compile time;
 * - and it *validates on write*, so an unknown key or a mistyped value throws a
 *   `ValidationError` instead of silently landing in the column.
 *
 * That pair replaces the runtime `readCommunityFeedback`-style reader this
 * started as: a defensive parser can only tell you the data was already wrong,
 * whereas the schema stops it being written. Same trick as
 * `Registrations.questions` (`registrationQuestionsJsonSchema`).
 *
 * Never writable through the API, by anyone. System writers pass
 * `overrideAccess`, which skips field access entirely; for everyone else
 * Payload *deletes the key from the incoming patch* rather than nulling the
 * column (`beforeValidate/promise.js`), so a save that never rendered the field
 * — an admin form, a partial API patch — can't wipe it.
 */
export function systemMetaField(options: {
  /** Unique `$id` for the schema. */
  uri: string
  /** Names the generated interface in `payload-types.ts` — without it Payload derives one from `$id`. */
  title: string
  /** One entry per namespace, e.g. `{ communityFeedback: { … } }`. */
  namespaces: Record<string, JSONSchema4>
  /** Extra admin config merged over the defaults (e.g. `condition`). */
  admin?: JSONField['admin']
}): JSONField {
  return {
    name: 'systemMeta',
    type: 'json',
    jsonSchema: {
      uri: options.uri,
      fileMatch: [options.uri],
      schema: {
        $id: options.uri,
        title: options.title,
        type: 'object',
        additionalProperties: false,
        properties: options.namespaces,
      },
    },
    access: { update: () => false },
    admin: {
      readOnly: true,
      description: 'System-managed metadata. Written by hooks, never by hand.',
      ...options.admin,
    },
  }
}
