'use server'

import type { VerifyOutcome } from '../../events/verify/VerificationCard'

import { APIError, getPayload } from 'payload'

import { verifyFeedbackToken } from '@/lib/registrations/feedbackLinks'

import config from '@payload-config'

/**
 * Server Action backing the feedback page's Confirmed / Denied buttons.
 * Re-validates the token (never trust the client) and writes the vote through
 * the normal Registrations update path, so the eventFeedback gate (event still
 * published + unverified) and the community-feedback sync hook both apply.
 * The mutation lives only here (POST) — opening the emailed link never votes.
 */
export async function submitFeedbackAction(
  _prev: VerifyOutcome | null,
  formData: FormData,
): Promise<VerifyOutcome> {
  const token = typeof formData.get('token') === 'string' ? (formData.get('token') as string) : ''
  const vote = formData.get('vote') === 'confirmed' ? 'confirmed' : 'denied'
  const payload = await getPayload({ config })

  const claims = verifyFeedbackToken(token, payload.secret)
  if (claims.status !== 'valid') {
    return {
      tone: 'warning',
      title: 'Link no longer valid',
      message: 'This feedback link has expired or is no longer valid.',
      actions: [],
    }
  }

  try {
    await payload.update({
      collection: 'registrations',
      id: claims.claims.registrationId,
      data: { eventFeedback: vote },
      overrideAccess: true,
    })
    return {
      tone: 'success',
      title: 'Thank you!',
      message:
        vote === 'confirmed'
          ? 'Your confirmation helps keep the map accurate — thank you for letting us know the class is real.'
          : 'Thanks for letting us know. If enough attendees report the same, the listing will be taken down.',
      actions: [],
    }
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
}
