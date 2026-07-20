import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { EmailBrand } from '@/plugins/email'

export type UnsubscribeTone = 'success' | 'error'

/** Outcome flavour → emblem icon + accent colour. */
const TONES: Record<UnsubscribeTone, { Icon: LucideIcon; accent: string }> = {
  success: { Icon: CircleCheck, accent: '#16a34a' },
  error: { Icon: TriangleAlert, accent: '#ef4444' },
}

/** Serializable result of an unsubscribe attempt — what the card renders. */
export interface UnsubscribeOutcome {
  tone: UnsubscribeTone
  title: string
  message: string
}

/**
 * Branded Sahaj Atlas shell — gradient header + white card body — shared by the
 * confirmation form and the result card so both match the reminder email.
 * Neutral (no hooks / server-only deps) so it renders in server and client trees.
 *
 * @param iconSrc Relative icon path (a local /public asset) — keeps next/image
 *   free of remote-pattern config, mirroring the event-verify page.
 */
export function CardShell({
  brand,
  iconSrc,
  children,
}: {
  brand: EmailBrand
  iconSrc: string
  children: ReactNode
}) {
  const { primary, light } = brand.colors
  return (
    <div style={cardWrap}>
      <div style={card}>
        <div
          style={{
            ...header,
            backgroundColor: primary,
            backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${light} 100%)`,
          }}
        >
          <Image src={iconSrc} alt={brand.productName} width={48} height={48} style={icon} />
          <h1 style={headerTitle}>{brand.productName}</h1>
        </div>
        <div style={body}>{children}</div>
      </div>
    </div>
  )
}

/** Result card — a tone emblem, title, and message, all localized upstream. */
export function UnsubscribeCard({
  brand,
  iconSrc,
  tone,
  title,
  message,
}: UnsubscribeOutcome & { brand: EmailBrand; iconSrc: string }) {
  const { Icon, accent } = TONES[tone]
  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <div style={emblem}>
        <Icon size={44} color={accent} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 style={{ ...cardTitle, color: accent }}>{title}</h2>
      <p style={cardMessage}>{message}</p>
    </CardShell>
  )
}

export function primaryButton(brand: EmailBrand): CSSProperties {
  const { primary, light } = brand.colors
  return {
    display: 'inline-block',
    margin: 6,
    padding: '12px 24px',
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 15,
    textDecoration: 'none',
    cursor: 'pointer',
    border: 'none',
    color: '#ffffff',
    backgroundColor: primary,
    backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${light} 100%)`,
  }
}

const cardWrap: CSSProperties = { maxWidth: 520, margin: '0 auto', padding: '40px 20px' }
const card: CSSProperties = {
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}
const header: CSSProperties = { textAlign: 'center', padding: 30 }
const icon: CSSProperties = {
  display: 'block',
  margin: '0 auto 12px',
  padding: 8,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  objectFit: 'contain',
}
const headerTitle: CSSProperties = { color: '#ffffff', margin: 0, fontSize: 22 }
const body: CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '36px 30px',
  textAlign: 'center',
}
const emblem: CSSProperties = { fontSize: 44, lineHeight: 1, marginBottom: 12 }
const cardTitle: CSSProperties = { margin: '0 0 12px', fontSize: 20 }
const cardMessage: CSSProperties = { margin: 0, color: '#555', lineHeight: 1.6, fontSize: 15 }
