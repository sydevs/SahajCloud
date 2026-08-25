'use server'

import type { PageAction, VerifyOutcome } from './VerificationCard'

import { getPayload } from 'payload'

import { verifyEventFromToken } from '@/collections/Events/lifecycle/verify'
import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env'
import { readVerifyToken } from '@/lib/eventVerification/token'

import config from '@payload-config'

function atlasHome(): string | null {
  return serverEnv.WEMEDITATE_WEB_URL ? `${serverEnv.WEMEDITATE_WEB_URL}/map` : null
}

/**
 * Server Action backing the "Verify this event" button. Re-validates the token
 * (never trust the client), runs the shared verify op, and returns a
 * serializable outcome. The mutation lives only here (POST) — opening the page
 * (GET) never verifies, so email link-scanners can't auto-verify.
 */
export async function verifyEventAction(
  _prev: VerifyOutcome | null,
  formData: FormData,
): Promise<VerifyOutcome> {
  const token = typeof formData.get('token') === 'string' ? (formData.get('token') as string) : ''
  const payload = await getPayload({ config })
  const home = atlasHome()
  const backSecondary: PageAction[] = home
    ? [{ label: 'Back to Sahaj Atlas', href: home, variant: 'secondary' }]
    : []
  const backPrimary: PageAction[] = home
    ? [{ label: 'Back to Sahaj Atlas', href: home, variant: 'primary' }]
    : []

  try {
    const event = await verifyEventFromToken({ payload, token })
    if (!event) {
      return {
        tone: 'warning',
        title: 'Link no longer valid',
        message:
          'This verification link has expired or is no longer valid. Please wait for the next reminder email.',
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
    const claims = await readVerifyToken(token, payload.secret)
    const eventId = claims.status === 'valid' ? claims.claims.eventId : 'unknown'
    const managerId = claims.status === 'valid' ? claims.claims.managerId : 'unknown'
    payload.logger.warn({
      msg: 'verify page: verification failed',
      eventId,
      managerId,
      error: detail,
      occurredAt,
    })
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
