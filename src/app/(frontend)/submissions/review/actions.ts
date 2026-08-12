'use server'

import type { VerifyOutcome } from '../../events/verify/VerificationCard'

import { getPayload } from 'payload'

import { applyReview, verifyReviewToken } from '@/collections/EventSubmissions/lifecycle/review'
import { CONTACT_EMAIL } from '@/lib/contact'

import config from '@payload-config'

/**
 * Server Action backing the review page's Accept/Reject buttons. Re-validates
 * the token (never trust the client), runs the shared review op, and returns a
 * serializable outcome card. The mutation lives only here (POST) — opening the
 * emailed link (GET) never reviews, so mail scanners can't auto-accept.
 */
export async function reviewSubmissionAction(
  _prev: VerifyOutcome | null,
  formData: FormData,
): Promise<VerifyOutcome> {
  const token = typeof formData.get('token') === 'string' ? (formData.get('token') as string) : ''
  const action = formData.get('action') === 'accept' ? 'accept' : 'reject'
  const payload = await getPayload({ config })

  const claims = verifyReviewToken(token, payload.secret)
  if (claims.status !== 'valid') {
    return {
      tone: 'warning',
      title: 'Link no longer valid',
      message: 'This review link has expired or is no longer valid.',
      actions: [],
    }
  }

  try {
    const result = await applyReview({
      payload,
      submissionId: claims.claims.submissionId,
      action,
      managerId: claims.claims.managerId,
    })

    if (result.status === 'created' || result.status === 'updated') {
      return {
        tone: 'success',
        title: result.status === 'created' ? 'Event created' : 'Changes applied',
        message:
          result.status === 'created'
            ? 'Thank you — the submission was accepted and published as an unverified listing. Assign it a manager in the admin panel to adopt it into the verification cycle.'
            : 'Thank you — the proposed changes were applied to the event.',
        actions: [],
      }
    }
    if (result.status === 'rejected') {
      return {
        tone: 'success',
        title: 'Submission rejected',
        message: 'The submission was rejected and kept for record-keeping. No event was changed.',
        actions: [],
      }
    }
    // A terminal status from before this click — someone got there first.
    return {
      tone: 'warning',
      title: 'Already handled',
      message: `This submission was already resolved (${result.status}). Nothing was changed.`,
      actions: [],
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    payload.logger.warn({
      msg: 'submission review page: review failed',
      submissionId: claims.claims.submissionId,
      action,
      error: detail,
    })
    const subject = `Submission review failed — submission #${claims.claims.submissionId}`
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(detail)}`
    return {
      tone: 'error',
      title: 'Could not apply the review',
      message: `Something went wrong: ${detail}`,
      actions: [{ label: 'Report issue', href: mailto, variant: 'primary' }],
    }
  }
}
