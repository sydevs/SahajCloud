import type { FieldHook, TextFieldSingleValidation } from 'payload'

import { ValidationError } from 'payload'
import { text as textFieldValidation } from 'payload/shared'

import { URL_RE } from '@/lib/eventQuality'
import {
  composeEventTitleFromPlace,
  resolveTitlePlace,
  resolveTitleTemplates,
} from '@/lib/eventTitle/autoTitle'
import { addressPlaceName, titleSlotForSchedule } from '@/lib/eventTitle/compose'
import { relationId } from '@/lib/utilities/relationId'

export const eventTitleBeforeChange: FieldHook = async ({ value, data, originalDoc, req }) => {
  const incoming = typeof value === 'string' ? value : undefined
  const existing = typeof originalDoc?.title === 'string' ? originalDoc.title : undefined
  // `incoming ?? existing` keeps an existing title on a partial update (value
  // undefined) but lets an explicit clear (value '') fall through to auto-fill.
  const current = incoming ?? existing
  if (current && current.trim()) return current

  const place = await resolveTitlePlace(
    data?.address ?? originalDoc?.address,
    data?.region ?? originalDoc?.region,
    req,
  )
  // Nothing to name the place with. `required` can't be what refuses this any
  // more: `eventTitleValidate` has to permit a blank title so the browser —
  // where no hook runs — can reach this hook at all, and it can only see that a
  // region is *selected*, not that its name resolves. So the guarantee is
  // enforced here, at the one point that knows the auto-fill came up empty.
  // Reached only when the region read fails (a trashed region, a DB blip) or an
  // event somehow has neither an address nor a region.
  if (!place) {
    // A draft is allowed to be incomplete: Payload skips `required` entirely
    // for one, and this throw stands in for `required`, so it has to skip too.
    // The guarantee is that every *published* event carries a title.
    if ((data?._status ?? originalDoc?._status) === 'draft') return value
    throw new ValidationError({
      collection: 'events',
      errors: [
        {
          path: 'title',
          message: 'Add a title — this event has no venue or region to write one from.',
        },
      ],
    })
  }

  const templates = await resolveTitleTemplates(req)
  const slot = titleSlotForSchedule(data?.schedule ?? originalDoc?.schedule)
  // The guard above guarantees a usable place, so this returns a non-null string.
  return composeEventTitleFromPlace(templates[slot], place)
}

/**
 * `validate` for the Events `title` field — the other half of the hook above.
 *
 * Three jobs, in order:
 *
 * 1. **Refuse a link.** A title isn't clickable, so a URL in it is dead text.
 * 2. **Permit a blank title when the auto-fill can take over.** This is the
 *    load-bearing one. Field `beforeChange` hooks run *before* validation
 *    server-side (`payload/dist/fields/hooks/beforeChange/promise.js` — hooks at
 *    line 58, `validate` at 86), so on the server the field is already filled by
 *    the time it's checked. **In the browser no hook runs at all**, so a
 *    `required` blank field is refused before the request is ever sent — which
 *    made the admin reject the exact workflow this field's own description
 *    recommends ("Leave blank to fill in from the venue").
 *
 *    Permitting it costs `required` its teeth, because supplying `validate`
 *    replaces the default that enforces it (see 3). The guarantee doesn't rest
 *    on this function: the hook above **throws** when the auto-fill has nothing
 *    to work from, which is the only point that knows. What this decides is
 *    merely whether the browser bothers to ask the server — hence the cheap
 *    test (is a place *plausible*) rather than the real one.
 * 3. **Otherwise defer to Payload's own text validation** — composed rather
 *    than reimplemented, because supplying `validate` *replaces* the default
 *    (`payload/dist/fields/config/sanitize.js` installs it only when a field has
 *    none), which would silently drop the field's `maxLength`.
 */
export const eventTitleValidate: TextFieldSingleValidation = (value, options) => {
  if (typeof value === 'string' && URL_RE.test(value)) {
    return 'Remove the link — a title isn’t clickable. Put it in Website or Online URL instead.'
  }

  if (!value) {
    const { address, region } = (options.data ?? {}) as { address?: unknown; region?: unknown }
    // The hook will compose "Evening Meditation at «venue»" — or, with no
    // address, "…at «region»" — from these.
    if (addressPlaceName(address) || relationId(region) !== null) return true
    if (options.required) {
      return 'Add a title, or fill in the venue address and one will be written for you.'
    }
  }

  return textFieldValidation(value, options)
}
