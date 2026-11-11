import type { PayloadRequest, UIFieldServerComponent } from 'payload'

import React, { cache } from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import type { MailingListConfig } from '@/lib/mailingList/types'

import { MailingListKey } from './MailingListKey'

/**
 * The stored key's last four characters, for the one service the caller may
 * read, or `null`.
 *
 * ⚠ **The row id is the caller's to choose, so the caller's own read access is
 * the gate.** A field component renders on the document view *and* on every
 * `form-state` request, and that server function takes `id` and `data` from the
 * browser and checks only `canAccessAdmin` — so without the first read here,
 * any manager could ask for any service's form state and be handed four
 * characters of its provider secret, row by row.
 *
 * Wrapped in React's `cache`, as `loadInstallRecord` is, so one request reads
 * the row once however many components ask.
 */
const loadLast4 = cache(async (req: PayloadRequest, id: number): Promise<null | string> => {
  const readable = await req.payload.findByID({
    collection: 'clients',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: false,
    req,
    // The narrowest row there is: `id` survives any include-mode select, and
    // `ClientsSelect` does not name it.
    select: { id: true } as never,
  })
  if (!readable) return null

  // Only now the value itself: `secretField` denies every read, so the decrypt
  // runs for nobody but an `overrideAccess` caller.
  const client = await req.payload.findByID({
    collection: 'clients',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { mailingList: true },
  })
  const key = (client?.mailingList as MailingListConfig | undefined)?.apiKey

  return typeof key === 'string' && key !== '' ? key.slice(-4) : null
})

/**
 * The mailing-list key's control, under the list ID on the Atlas tab.
 *
 * A server component, because the key is `secretField` and therefore
 * `admin.disabled` — it is in no form state, so a client component has nothing
 * to read. `InstallSummary` reads the `site` group for the same reason.
 *
 * A key the `afterRead` hook could not decrypt arrives as `null` and reads as
 * no key set, which is what every other reader makes of it too.
 */
const MailingListKeyField: UIFieldServerComponent = async ({ data, field, req }) => {
  const id = (data as { id?: unknown } | undefined)?.id
  if (typeof id !== 'number') return null

  return <MailingListKey last4={await loadLast4(req, id)} style={mergeFieldStyles(field.admin)} />
}

export default MailingListKeyField
