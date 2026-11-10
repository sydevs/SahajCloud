import type { UIField } from 'payload'

import { hideUntilCreated } from './hideUntilCreated'

/**
 * The contact details of the managers named on a region or an event, as a
 * table under the field that names them (#908).
 *
 * Every field on another manager's row but `name` is locked to that manager
 * and to admins (`src/collections/Managers/access.ts`), so the pickers above
 * this show names alone. This is where a region manager reaches the people
 * they need to follow up with: the component reads the rows with
 * `overrideAccess` behind `mayReadManagerContacts`, the way an event's
 * Registrations tab reads its signups behind its own gate.
 *
 * Place it directly after the `managers` / `manager` field it describes. It
 * reads the saved row, so it shows what was last saved, not what the picker
 * holds now.
 */
export function managerContactsField(): UIField {
  return {
    name: 'managerContacts',
    type: 'ui',
    admin: {
      condition: hideUntilCreated,
      components: { Field: '@/components/admin/ManagerContacts' },
    },
  }
}
