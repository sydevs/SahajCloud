'use server'

import type { UnsubscribeOutcome } from './UnsubscribeCard'

import { getPayload } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { readUnsubscribeToken } from '@/lib/registrations/unsubscribeToken'
import { EMAIL_STRING_DEFAULTS, resolveEmailStrings } from '@/lib/translations/emailStrings'

import config from '@payload-config'

/**
 * Server Action backing the "Unsubscribe" button. Re-validates the token (never
 * trust the client), sets `remindersUnsubscribedAt` on the registration — which
 * stops the reminder job, without touching the registration itself — and returns
 * a localized outcome. The mutation lives only here (POST); opening the page
 * (GET) never unsubscribes, so an email link-scanner can't trigger it.
 *
 * Setting the flag when it's already set is a harmless no-op, so a replayed link
 * is safe. The token names one registration and is HMAC-signed, so it can't be
 * forged or altered to affect another.
 */
export async function unsubscribeAction(
  _prev: UnsubscribeOutcome | null,
  formData: FormData,
): Promise<UnsubscribeOutcome> {
  const token = typeof formData.get('token') === 'string' ? (formData.get('token') as string) : ''
  const payload = await getPayload({ config })

  const result = readUnsubscribeToken(token, payload.secret)
  if (result.status !== 'valid') {
    // A tampered/forged submission — no registration to localize against.
    return {
      tone: 'error',
      title: EMAIL_STRING_DEFAULTS.unsubscribe_error_title,
      message: EMAIL_STRING_DEFAULTS.unsubscribe_error_message,
    }
  }

  try {
    const registration = await payload.findByID({
      collection: 'registrations',
      id: result.claims.registrationId,
      depth: 0,
      overrideAccess: true,
    })
    const strings = await resolveEmailStrings({
      payload,
      locale: registration.locale as LocaleCode | null,
    })

    if (!registration.remindersUnsubscribedAt) {
      await payload.update({
        collection: 'registrations',
        id: registration.id,
        data: { remindersUnsubscribedAt: new Date().toISOString() },
        overrideAccess: true,
      })
    }

    return {
      tone: 'success',
      title: strings.unsubscribe_done_title,
      message: strings.unsubscribe_done_message,
    }
  } catch (error) {
    payload.logger.warn({
      msg: 'unsubscribe page: failed to unsubscribe',
      registrationId: result.claims.registrationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      tone: 'error',
      title: EMAIL_STRING_DEFAULTS.unsubscribe_error_title,
      message: EMAIL_STRING_DEFAULTS.unsubscribe_error_message,
    }
  }
}
