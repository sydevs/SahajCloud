import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { confirmPage, noticePage } from '../page'
import { readSigninToken } from '../token'
import { REDEEM_MAGIC_LINK_PATH } from './redeemMagicLink'

/**
 * `GET /api/<slug>/redeem-magic-link?token=…`
 *
 * The page a delivered sign-in link opens. It spends nothing: the form on it
 * POSTs to this same path, and `redeemMagicLink` is what burns the link.
 *
 * ⚠ **This exists because link-scanning mail security fetches URLs in inbound
 * mail.** Defender Safe Links and Proofpoint issue a `GET` on every link in a
 * message before its recipient sees it, so a `GET` that burned the link handed
 * the scanner the manager's one use — and `request-magic-link`'s 60-second
 * throttle then refused the obvious retry. Scanners do not POST and do not
 * click, so moving the burn behind a form submission is what keeps the link
 * alive until its owner acts. Any automatic submission added to that page
 * restores the hazard.
 *
 * Auth: **intentionally anonymous**, like both its siblings — the token is the
 * credential.
 *
 * The token is verified here only to answer a dead link with a sentence rather
 * than with a button that fails. That check reads no document and writes
 * nothing, which is what keeps a scanner's fetch free of consequence.
 */
export function confirmMagicLink(config: LoginCollectionConfig): Endpoint {
  const { slug } = config

  return {
    path: REDEEM_MAGIC_LINK_PATH,
    method: 'get',
    handler: async (req) => {
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await readSigninToken(token, req.payload.secret)
      if (result.status === 'expired') {
        return noticePage(410, 'This link has expired', 'Request a new sign-in link.')
      }
      if (result.status !== 'valid' || result.claims.collection !== slug) {
        return noticePage(400, 'This link is not valid', 'Request a new sign-in link.')
      }

      // The credential rides the form's action rather than a hidden field,
      // because the POST handler reads `req.query.token` — a custom endpoint is
      // handed no parsed form body to read it from instead. Built absolute, the
      // same way the email builds the link that arrives here.
      return confirmPage(
        `${getServerUrl()}/api/${slug}${REDEEM_MAGIC_LINK_PATH}?token=${encodeURIComponent(token!)}`,
      )
    },
  }
}
