import { hasLocalizeStatusEnabled } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { Events } from '@/collections/Events/Events'

/**
 * `updateEventWithoutValidation` passes `unpublishAllLocales` because that is
 * the one argument which skips validation of stored data while still writing
 * the main row (#842).
 *
 * On a collection that sets `versions.drafts.localizeStatus`, the same argument
 * also writes `_status: 'draft'` for every locale — Payload gates that branch on
 * nothing else (`payload/dist/collections/operations/utilities/update.js`). The
 * root `experimental.localizeStatus` flag is already on, so Events leaving the
 * per-collection flag unset is the only thing keeping a registration, a feedback
 * vote and the nightly sweep from unpublishing the event they book-keep.
 *
 * The `⚠` comment on `versions` in `Events.ts` says this. Only this asserts it.
 */
describe('Events bookkeeping writes cannot unpublish', () => {
  it('leaves localizeStatus off, so unpublishAllLocales only skips validation', () => {
    expect(hasLocalizeStatusEnabled(Events)).toBe(false)
  })
})
