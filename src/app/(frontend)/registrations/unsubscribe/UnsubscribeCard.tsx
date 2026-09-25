import type { EmailBrand } from '@/plugins/email'

import { PublicPage, OutcomeBody } from '../../_components/PublicPage'

/** This page either finishes or fails — it has no waiting state to warn about. */
export type UnsubscribeTone = 'success' | 'error'

/** Serializable result of an unsubscribe attempt — what the card renders. */
export interface UnsubscribeOutcome {
  tone: UnsubscribeTone
  title: string
  message: string
}

/** Result card — a tone emblem, title, and message, all localized upstream. */
export function UnsubscribeCard({
  brand,
  iconSrc,
  tone,
  title,
  message,
}: UnsubscribeOutcome & { brand: EmailBrand; iconSrc: string }) {
  return (
    <PublicPage iconSrc={iconSrc} title={brand.productName}>
      <OutcomeBody tone={tone} title={title} message={message} />
    </PublicPage>
  )
}
