import type { FieldHook } from 'payload'

import { ValidationError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * Refuses an event with no region, on a draft too. `required` alone cannot
 * say this: Payload skips field validation on a draft save. A region manager's
 * write access to an event is its `region`, so a first draft saved without
 * one was locked against the manager who created it.
 *
 * A field hook, not a collection one, because only a field `beforeValidate`
 * sees an omitted value as omitted: Payload refills it from the stored row
 * straight after this field's own hooks. ⚠ Read the omission off
 * `siblingData`, never `value`, which already carries that refill. An update
 * that leaves `region` out keeps the stored value and passes, so a job writing
 * an unrelated column is never refused. A write that names `region` has to name
 * one. That includes the admin form, which always sends it.
 */
export const requireRegion: FieldHook = ({ operation, siblingData, value }) => {
  if (operation === 'update' && siblingData.region === undefined) return value
  if (relationId(value) !== null) return value
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
