import { describe, expect, it } from 'vitest'

import { feedbackDestination } from '@/app/(frontend)/registrations/feedback/destination'

/**
 * Where a post-event answer sends the reader (sydevs/SahajAtlasWeb#164). The
 * rules look small but each one is load-bearing, and the failure mode of every
 * one of them is a broken landing rather than an error anyone would notice.
 */

const EVENT = { webUrl: 'https://atlas.test/map/us/california/bay-area/652' }
const REGION = { webUrl: 'https://atlas.test/map/us/california/bay-area' }

describe('feedbackDestination', () => {
  it('sends a confirmation to the event they attended', () => {
    expect(feedbackDestination({ vote: 'confirmed', event: EVENT, region: REGION })).toBe(
      `${EVENT.webUrl}?feedback=confirmed`,
    )
  })

  it('sends a denial to the region, never to the event', () => {
    // They have just said the class isn't there; the listing is the one page
    // that shouldn't greet them. It may also no longer exist — see below.
    expect(feedbackDestination({ vote: 'denied', event: EVENT, region: REGION })).toBe(
      `${REGION.webUrl}?feedback=denied`,
    )
  })

  it('falls back to the region when the event has no public page', () => {
    // `webUrl` is publish-gated, so an unpublished event reads null — which is
    // exactly the state a fifth denial leaves it in.
    expect(
      feedbackDestination({ vote: 'confirmed', event: { webUrl: null }, region: REGION }),
    ).toBe(`${REGION.webUrl}?feedback=confirmed`)
  })

  it('returns null when nothing resolves, so the reader keeps our own card', () => {
    // The state the world is in until the Atlas half of #164 ships, and any
    // time a region somehow has no path.
    expect(feedbackDestination({ vote: 'confirmed', event: null, region: null })).toBeNull()
    expect(feedbackDestination({ vote: 'denied', event: EVENT, region: undefined })).toBeNull()
  })

  it('ignores an unpopulated relationship rather than treating an id as a URL', () => {
    // At depth 0 these arrive as numbers; `region: 594` must not become
    // "594?feedback=denied".
    expect(feedbackDestination({ vote: 'denied', event: 652, region: 594 })).toBeNull()
  })

  it('appends to a base that already carries a query string', () => {
    expect(
      feedbackDestination({
        vote: 'confirmed',
        event: { webUrl: 'https://a.test/x?lang=cs' },
        region: null,
      }),
    ).toBe('https://a.test/x?lang=cs&feedback=confirmed')
  })
})
