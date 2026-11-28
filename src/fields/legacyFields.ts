import type { Field } from 'payload'

/**
 * Migration-only fields shared by the five collections carrying imported Atlas
 * rows (Clients, Events, Managers, Regions, Users), to be dropped once the
 * import is verified. `legacyId` is indexed for relationship rewiring and
 * idempotent re-runs.
 *
 * Fresh objects on each call, or Payload's field sanitizer would mutate one
 * config shared across collections.
 */
export function legacyMigrationFields(): Field[] {
  return [
    {
      label: 'Legacy',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'legacyId',
          type: 'number',
          index: true,
          admin: { readOnly: true },
        },
        {
          name: 'legacyData',
          type: 'json',
          // No schema on purpose: the source row verbatim, and five
          // collections share the field, so there is no one shape to declare.
          admin: { readOnly: true },
        },
      ],
    },
  ]
}
