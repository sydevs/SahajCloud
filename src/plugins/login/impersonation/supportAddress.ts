import type { EmailFieldValidation } from 'payload'

import { email } from 'payload/shared'

import { isSupportAddress } from './gate'

export const SUPPORT_ADDRESS_TAKEN = 'This address belongs to the support account.'

/**
 * Refuse giving any manager the support address, `CONTACT_EMAIL`, through the
 * admin or the API. Moving it onto one's own account is the one way another
 * admin could take the support role (`isSupportAccount`). A row that already
 * holds it keeps it, and a write with no user — a seed or an operator script,
 * which is how the support account is created — is not judged.
 */
export const refuseSupportAddress: EmailFieldValidation = (value, options) => {
  const standard = email(value, options)
  if (standard !== true) return standard
  if (!options.req?.user || !isSupportAddress(value)) return true
  return isSupportAddress(options.previousValue as string | undefined) || SUPPORT_ADDRESS_TAKEN
}
