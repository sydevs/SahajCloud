'use server'

import type { VerifyOutcome } from '../../events/verify/VerificationCard'

import { redirect } from 'next/navigation'
import { APIError, getPayload, type Payload } from 'payload'

import { verifyFeedbackToken } from '@/lib/registrations/feedbackLinks'
import type { Event } from '@/payload-types'

import config from '@payload-config'

import { feedbackDestination } from './destination'

/**
 * Load just enough of the registration to decide where to send the reader.
 * The decision itself is `feedbackDestination` — pure, and unit-tested.
 */
async function resolveDestination(
  payload: Payload,
  registrationId: number,
  vote: 'confirmed' | 'denied',
): Promise<string | null> {
  const registration = await payload
    .findByID({
      collection: 'registrations',
      id: registrationId,
      // Depth 2: registration → event → region, so a denial reaches the
      // region's own URL without a second query.
      depth: 2,
      overrideAccess: true,
      disableErrors: true,
    })
    .catch(() => null)

  const event = registration?.event
  if (!event || typeof event !== 'object') return null
  return feedbackDestination({ vote, event, region: (event as Event).region })
}

/** A recorded vote, so the page can offer to flip it if they misclicked. */
export interface FeedbackOutcome extends VerifyOutcome {
  recorded?: 'confirmed' | 'denied'
}

/**
 * Server Action backing the feedback page's Confirmed / Denied buttons.
 * Re-validates the token (never trust the client) and writes the vote through
 * the normal Registrations update path, so the eventFeedback gate (event still
 * published + unverified) and the community-feedback sync hook both apply.
 *
 * **The mutation lives only here, behind a POST.** Opening the emailed link
 * never votes on its own — mail scanners and link prefetchers issue GETs, and
 * a vote nobody cast is worse than a vote nobody casts: the community verdict
 * is the whole point. The page auto-submits the emailed choice with JS so a
 * real reader still only clicks once (see `FeedbackForm`).
 */
export async function submitFeedbackAction(
  _prev: FeedbackOutcome | null,
  formData: FormData,
): Promise<FeedbackOutcome> {
  const token = typeof formData.get('token') === 'string' ? (formData.get('token') as string) : ''
  const vote = formData.get('vote') === 'confirmed' ? 'confirmed' : 'denied'
  const payload = await getPayload({ config })

  const claims = await verifyFeedbackToken(token, payload.secret)
  if (claims.status !== 'valid') {
    return {
      tone: 'warning',
      title: 'Link no longer valid',
      message: 'This feedback link has expired or is no longer valid.',
      actions: [],
    }
  }

  let destination: string | null = null
  try {
    await payload.update({
      collection: 'registrations',
      id: claims.claims.registrationId,
      data: { eventFeedback: vote },
      overrideAccess: true,
    })
    // Resolved *after* the write, never before: a fifth denial unpublishes the
    // event, so the destination depends on what this very vote just did.
    destination = await resolveDestination(payload, claims.claims.registrationId, vote)
  } catch (error) {
    if (error instanceof APIError && error.status === 409) {
      return {
        tone: 'warning',
        title: 'Feedback closed',
        message:
          'This listing is no longer collecting feedback — it has since been verified by a coordinator or taken down.',
        actions: [],
      }
    }
    payload.logger.warn({
      msg: 'registration feedback page: vote failed',
      registrationId: claims.claims.registrationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      tone: 'error',
      title: 'Could not record your answer',
      message: 'Something went wrong recording your answer. Please try again later.',
      actions: [],
    }
  }

  // Outside the try on purpose: `redirect` signals by throwing a NEXT_REDIRECT
  // error, and the catch above would swallow it and report a failed vote that
  // in fact succeeded.
  if (destination) redirect(destination)

  return {
    tone: 'success',
    title: 'Thank you!',
    message:
      vote === 'confirmed'
        ? 'Your confirmation helps keep the map accurate — thank you for letting us know the class is real.'
        : 'Thanks for letting us know. If enough attendees report the same, the listing will be taken down.',
    actions: [],
    recorded: vote,
  }
}
