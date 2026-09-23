import { createElement } from 'react'

import { SignInLinkEmail } from '@/emails/SignInLinkEmail'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'
import type { LoginCollectionConfig } from '@/plugins/login'

const INACTIVE: Manager['type'] = 'inactive'

/**
 * What `loginPlugin` needs to serve sign-in links to `managers` (#837).
 *
 * It lives here, not in the plugin, because every value in it is this
 * collection's own: the `inactive` predicate is a `managers` enum, and the
 * sender, subject and template are manager branding. The plugin holds the
 * routes; this holds what makes them mail a manager.
 */
export const managersLogin: LoginCollectionConfig = {
  slug: 'managers',
  // Same predicate as `requireActiveManager`, read off the fetched document
  // rather than `req.user` — both endpoints are anonymous. `INACTIVE` is typed
  // against the generated enum, so renaming that option upstream fails here
  // rather than quietly letting every manager through.
  isEligible: (doc) => doc.type !== INACTIVE,
  mail: async ({ doc, signInUrl, validFor }) => {
    const brand = getEmailBrand()

    return {
      from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
      subject: stripNewlines(`Your sign-in link — ${brand.productName}`),
      html: await renderEmail(
        createElement(SignInLinkEmail, {
          name: doc.name || doc.email || '',
          signInUrl,
          validFor,
        }),
      ),
    }
  },
  // `type` is what `isEligible` reads, and the endpoints select a bounded field
  // list — without this it would see `undefined` and let an inactive manager in.
  select: { type: true },
}
