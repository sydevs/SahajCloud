import type { LoginCollectionConfig, LoginDocument } from './types'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { signLinkToken } from './token'

/**
 * An emailed link that signs `doc` in and lands on one admin page.
 *
 * ⚠ **It addresses the sign-in page, not the redeem route**, like the other two
 * links: the page reads the token and writes nothing, so a mail scanner's `GET`
 * spends nothing, and the session is minted only behind that page's form.
 *
 * @param to - The admin path to land on. Refused unless under `/admin/`.
 * @param label - What the link opens, for the confirmation page.
 * @param tab - A tab to open that page on, by label. @see seedTabPreference
 */
export async function pageLinkUrl(
  config: LoginCollectionConfig,
  doc: Pick<LoginDocument, 'id'>,
  { label, tab, to }: { label: string; tab?: string; to: string },
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const token = await signLinkToken(
    {
      collection: config.slug as string,
      issuedAt: now.getTime(),
      label,
      to,
      userId: doc.id,
      ...(tab && { tab }),
    },
    secret,
    now,
  )
  return `${getServerUrl()}${config.requestPagePath}?link=${encodeURIComponent(token)}`
}
