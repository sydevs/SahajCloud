import type { Field } from 'payload'

/**
 * Migration-only fields shared by the four Atlas collections (Events,
 * Registrations, Users, Regions). Populated by the Phase 3 importer and
 * dropped in a future migration once the import is verified.
 *
 * - `legacyId` — the source row's integer primary key, indexed for
 *   relationship rewiring and idempotent re-runs.
 * - `legacyData` — the complete raw source record (verbatim), kept for
 *   debugging / re-derivation during and after the import.
 *
 * Returns fresh field objects on each call so the same config object isn't
 * shared — and mutated by Payload's field sanitizer — across collections.
 */
export function legacyMigrationFields(): Field[] {
  return [
    {
      label: 'Legacy',
      type: 'collapsible',
      // Import-only debugging data — never what an editor opened the document
      // for, so it stays out of the way until asked for.
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
          admin: { readOnly: true },
        },
      ],
    },
  ]
}
