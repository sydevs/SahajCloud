import type { FieldHook } from 'payload'

import { ValidationError } from 'payload'

import { relationId } from '@/plugins/access/documentManagers'

/**
 * Refuses an event with no region, on a draft too: Payload skips `required` on
 * a draft save, and a region manager's write access to an event is its
 * `region`.
 *
 * A field hook, as `refuseContactWithoutBox` is, because only a field
 * `beforeValidate` sees an omitted value as omitted. ⚠ Read the omission off
 * `siblingData`, never `value`, which already carries the stored row's.
 * `relationId` is the access layer's, which reads a numeric string as the id
 * Payload stores it as.
 */
export const requireRegion: FieldHook = ({ operation, siblingData, value }) => {
  const omittedOnUpdate = operation === 'update' && siblingData.region === undefined
  if (omittedOnUpdate || relationId(value) !== null) return value
  throw new ValidationError({
    collection: 'events',
    errors: [
      {
        path: 'region',
        message: 'Choose the city or venue this event belongs to. A draft needs one too.',
      },
    ],
  })
}
