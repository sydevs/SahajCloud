/**
 * Where a verification reminder's button lands its recipient (#839).
 *
 * ⚠ **The gap this closes.** Both recipients' buttons are page links whose
 * landing is a signed `to` claim, and the redeem route falls back to `/admin` —
 * the dashboard — whenever that claim is absent. A `to` lost at signing is
 * therefore not an error anywhere: the manager is signed in and dropped on the
 * dashboard, with the event they were asked about nowhere in sight. Only the
 * event manager's end of this is covered by an integration spec
 * (`event-verification.int.spec.ts`), and a region manager's link is nothing
 * but this claim.
 */
import { describe, expect, it } from 'vitest'

import { openUrl } from '@/app/(frontend)/_components/loginUrls'
import { managersLogin } from '@/collections/Managers/login'
import { reminderButtonUrl } from '@/jobs/ExpireEvents/verifyUrl'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { readLinkToken, REDEEM_LINK_PATH } from '@/plugins/login'

const SECRET = 'test-secret-for-reminder-buttons'
const NOW = new Date('2026-09-28T12:00:00.000Z')
const EVENT = { id: 12, title: 'Thursday Sitting' }

const claimsOf = async (url: string) => {
  const link = new URL(url).searchParams.get('link')
  const result = await readLinkToken(link, SECRET, NOW)
  if (result.status !== 'valid') throw new Error(`link refused: ${result.status}`)
  return result.claims
}

const buttonFor = (role: 'manager' | 'region') =>
  reminderButtonUrl({ event: EVENT, managerId: 7, now: NOW, role, secret: SECRET })

describe('a reminder button’s landing page', () => {
  it('lands the event’s own manager on the event, not the dashboard', async () => {
    expect(await claimsOf(await buttonFor('manager'))).toMatchObject({
      to: `/admin/collections/events/${EVENT.id}`,
      verifies: EVENT.id,
    })
  })

  it('lands a region manager on the same event page', async () => {
    // Theirs carries no `verifies` — a region manager may not know the details
    // — so the landing is the whole of what their button does.
    const claims = await claimsOf(await buttonFor('region'))
    expect(claims.to).toBe(`/admin/collections/events/${EVENT.id}`)
    expect(claims.verifies).toBeUndefined()
  })

  it('sends each recipient to the page that reads their link', async () => {
    // Neither page writes on a `GET`. The event manager's offers one-click
    // verification; a region manager's has nothing to verify.
    expect(await buttonFor('manager')).toContain(`${getServerUrl()}/events/verify?link=`)
    expect(await buttonFor('region')).toContain(
      `${getServerUrl()}${managersLogin.requestPagePath}?link=`,
    )
  })

  it('posts “Update the details” to the link route, which honours that claim', () => {
    expect(openUrl('T')).toBe(`${getServerUrl()}/api/${managersLogin.slug}${REDEEM_LINK_PATH}?token=T`)
  })
})
