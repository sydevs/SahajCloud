'use server'

import type { PageAction } from '../../_components/PublicPage'
import type { VerifyOutcome } from '../../_components/VerificationCard'

import { getPayload } from 'payload'

import { verifyEventFromLink } from '@/collections/Events/lifecycle/verify'
import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env'
import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import { readLinkToken } from '@/plugins/login'

import config from '@payload-config'

import { redeemUrl } from '../../_components/loginUrls'

function atlasHome(): string | null {
  return serverEnv.WEMEDITATE_WEB_URL ? `${serverEnv.WEMEDITATE_WEB_URL}/map` : null
}

/**
 * Server Action behind "Verify this event". Re-checks the link (never trust the
 * client), runs the shared verify op, and returns a serializable outcome. The
 * mutation lives only here, on the form's `POST` — opening the page never
 * verifies, so a mail scanner cannot.
 */
export async function verifyEventAction(
  _prev: VerifyOutcome | null,
  formData: FormData,
): Promise<VerifyOutcome> {
  const link = typeof formData.get('link') === 'string' ? (formData.get('link') as string) : ''
  const payload = await getPayload({ config })
  const home = atlasHome()
  const backSecondary: PageAction[] = home
    ? [{ label: 'Back to Sahaj Atlas', href: home, variant: 'secondary' }]
    : []
  const backPrimary: PageAction[] = home
    ? [{ label: 'Back to Sahaj Atlas', href: home, variant: 'primary' }]
    : []

  try {
    const event = await verifyEventFromLink({ payload, link })
    if (!event) {
      return {
        tone: 'warning',
        title: 'Link no longer valid',
        message:
          'This verification link has expired or is no longer valid. Please use the link in your latest reminder email.',
        actions: backPrimary,
      }
    }
    // The verify op re-publishes the event, so its public link resolves.
    const view: PageAction[] = event.webUrl
      ? [{ label: 'View event', href: event.webUrl, variant: 'primary' }]
      : []
    return {
      tone: 'success',
      title: 'Event verified',
      message: 'Thank you — this event has been verified and will stay listed.',
      actions: view.length ? [...view, ...backSecondary] : backPrimary,
    }
  } catch (error) {
    const occurredAt = new Date().toISOString()
    const detail = error instanceof Error ? error.message : String(error)
    const read = await readLinkToken(link, payload.secret)
    const eventId = read.status === 'valid' ? (read.claims.verifies ?? 'unknown') : 'unknown'
    const managerId = read.status === 'valid' ? read.claims.userId : 'unknown'
    payload.logger.warn({
      msg: 'verify page: verification failed',
      eventId,
      managerId,
      error: detail,
      occurredAt,
    })

    // Invalid stored data is the one failure the manager can clear themselves,
    // so it must not land on "contact the admin team" (#842). Verifying keeps
    // refusing — the data is fixed first. The edit button spends the same page
    // link, which signs them in on the way to the event.
    const fieldErrors = validationFieldErrors(error)
    if (fieldErrors) {
      return {
        tone: 'warning',
        title: 'Fix these details first',
        message: [
          'This event cannot be verified until its details are complete:',
          ...describeValidationErrors(fieldErrors),
        ].join('\n'),
        actions: [
          { label: 'Edit this event', href: redeemUrl(link), variant: 'primary', method: 'post' },
          ...backSecondary,
        ],
      }
    }
    // Pre-fill a support email with everything the admin team needs to triage.
    const subject = `Event verification failed — event #${eventId}`
    const body = [
      'I tried to verify an event from a reminder email and it failed.',
      '',
      `Event ID: ${eventId}`,
      `Manager ID: ${managerId}`,
      `Time: ${occurredAt}`,
      `Error: ${detail}`,
      '',
      '(Sent from the event verification page.)',
    ].join('\n')
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    return {
      tone: 'error',
      title: 'Could not verify',
      message:
        'Something went wrong verifying this event. Please contact the admin team — the button below opens a pre-filled email with the details.',
      actions: [{ label: 'Report issue', href: mailto, variant: 'primary' }, ...backSecondary],
    }
  }
}
