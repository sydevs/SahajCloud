import type { UIFieldServerComponent } from 'payload'

import React from 'react'

import { MailingListKey } from './MailingListKey'

/**
 * The mailing-list key's control, under the list ID on the Atlas tab.
 *
 * A server component, because the key is `secretField` and therefore
 * `admin.disabled` — it is in no form state, so a client component has nothing
 * to read. `InstallSummary` reads the `site` group for the same reason.
 *
 * **The document view is the gate.** A `clients` document opens only for an
 * admin or a manager the service lists (`docs/rules/access.md`), and no API key
 * reaches the admin panel at all — so a caller who may not read this row never
 * reaches this component. What it then shows is four characters, not the key.
 *
 * A key the `afterRead` hook could not decrypt arrives as `null` and reads as
 * no key set, which is what every other reader makes of it too.
 */
const MailingListKeyField: UIFieldServerComponent = async ({ data, payload }) => {
  const id = (data as { id?: unknown } | undefined)?.id
  if (typeof id !== 'number') return null

  const client = await payload.findByID({
    collection: 'clients',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { mailingList: true },
  })
  const key = (client?.mailingList as { apiKey?: null | string } | undefined)?.apiKey

  return <MailingListKey last4={typeof key === 'string' && key !== '' ? key.slice(-4) : null} />
}

export default MailingListKeyField
