import type { MailingListAdapter, MailingListProvider } from '../types'

import { brevoAdapter } from './brevo'
import { klaviyoAdapter } from './klaviyo'
import { mailchimpAdapter } from './mailchimp'

/**
 * Every provider this build speaks, and the whole of the dispatch.
 *
 * Keyed on the union derived from `Clients.mailingList.provider`, so the two
 * halves cannot drift: a provider the field offers with no adapter here, or an
 * adapter for one the field no longer offers, is a compile error.
 */
export const MAILING_LIST_ADAPTERS: Record<MailingListProvider, MailingListAdapter> = {
  mailchimp: mailchimpAdapter,
  brevo: brevoAdapter,
  klaviyo: klaviyoAdapter,
}

/**
 * The adapter for a stored provider value, or `null` for one this build does
 * not know.
 *
 * The lookup is by value rather than a cast, because a `clients` row written
 * before the group existed — or assembled by an `overrideAccess` writer — can
 * carry a string the select never offered.
 */
export function adapterFor(provider: string | null | undefined): MailingListAdapter | null {
  if (!provider || !Object.hasOwn(MAILING_LIST_ADAPTERS, provider)) return null
  return MAILING_LIST_ADAPTERS[provider as MailingListProvider]
}

/** The message for a provider `adapterFor` does not know. Stated once, used twice. */
export function unknownProviderMessage(provider: unknown): string {
  return `\`${String(provider)}\` is not a provider this build speaks.`
}
