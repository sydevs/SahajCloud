import type { CollectionBeforeChangeHook } from 'payload'

import { autoEventTitle } from '@/lib/eventTitle/autoTitle'
import { relationId } from '@/lib/utilities/relationId'

/**
 * Name a submission for the event it is about.
 *
 * `New Event: Evening Meditation at Kensington Community Hall`
 * `Update Event: Morning Meditation at World Tree`
 *
 * A submission had no name of its own, so the list read as a column of ids and
 * the breadcrumb said "1". The two things a reviewer sorts by are *which event*
 * and *new or a change to an existing one*, which is exactly this string.
 *
 * For a new-event submission the name is the title that event would be given
 * **on creation** — resolved through `autoEventTitle`, the same composition the
 * Events title hook runs, so the label a reviewer approves is the title they
 * end up with. A submitter-supplied `proposed.title` wins, because Events only
 * auto-fills a blank one.
 *
 * Stamped on create only. The place can still be unresolved at that moment
 * (screening resolves the region afterwards), in which case the title degrades
 * to the bare prefix rather than guessing — a submission called "New Event" is
 * honest, and the diff below it carries the detail.
 */

/** Prefixes, so the two shapes of submission read differently at a glance. */
const NEW_EVENT_PREFIX = 'New Event'
const UPDATE_EVENT_PREFIX = 'Update Event'

export const submissionTitle: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const targetId = relationId(data.event)

  if (targetId != null) {
    const target = await req.payload
      .findByID({
        collection: 'events',
        id: targetId,
        depth: 0,
        // A narrow select is required, not an optimization: this forwards the
        // caller's (API-client) request, and the client-query gate rejects an
        // unbounded nested read with a 400.
        select: { title: true },
        req,
      })
      .catch(() => null)
    const title = typeof target?.title === 'string' ? target.title.trim() : ''
    return { ...data, title: title ? `${UPDATE_EVENT_PREFIX}: ${title}` : UPDATE_EVENT_PREFIX }
  }

  const proposed = (data.proposed ?? {}) as Record<string, unknown>
  const submitted = typeof proposed.title === 'string' ? proposed.title.trim() : ''
  const title =
    submitted ||
    (await autoEventTitle({
      address: proposed.address,
      // Screening has not resolved a region yet on create; the submitter's
      // anchor is the closest thing to one, and `autoEventTitle` prefers the
      // address anyway.
      region: (data.regionHint as Record<string, unknown> | null)?.anchorRegion,
      schedule: proposed.schedule,
      req,
    })) ||
    ''

  return { ...data, title: title ? `${NEW_EVENT_PREFIX}: ${title}` : NEW_EVENT_PREFIX }
}
