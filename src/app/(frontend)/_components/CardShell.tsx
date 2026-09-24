import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { EmailBrand } from '@/plugins/email'

/**
 * The branded card every logged-out page in this route group renders inside.
 *
 * ⚠ **A private folder, not a route.** Next excludes an `_`-prefixed segment
 * from routing, which is what lets shared UI sit beside the pages that use it.
 * A route folder is not a module home — importing this from `events/verify/`
 * was the cheaper option and the wrong one.
 *
 * Only the shell, the tone emblems and the button styles live here. Each page
 * keeps its own outcome and tone types, because what a page can conclude is its
 * own business: {@link CardTone} is the widest set, and a page narrows it.
 */

/** Every flavour the emblem can take. A page narrows this to what it can produce. */
export type CardTone = 'success' | 'warning' | 'error'

/** Outcome flavour → emblem icon + accent colour. */
export const TONES: Record<CardTone, { Icon: LucideIcon; accent: string }> = {
  success: { Icon: CircleCheck, accent: '#16a34a' },
  warning: { Icon: Clock, accent: '#f59e0b' },
  error: { Icon: TriangleAlert, accent: '#ef4444' },
}

/** A button rendered under the message (`primary` filled, `secondary` outlined). */
export interface PageAction {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
}

/**
 * Gradient header + white card body, matching the mail these pages are reached
 * from. Neutral (no hooks, no server-only deps) so it renders in a server and a
 * client tree alike.
 *
 * @param iconSrc Relative icon path (a local /public asset) — keeps next/image
 *   free of remote-pattern config.
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

/** Row of primary/secondary brand buttons (anchors). */
export function ActionButtons({ brand, actions }: { brand: EmailBrand; actions: PageAction[] }) {
  if (actions.length === 0) return null
  const { primary } = brand.colors
  return (
    <div style={actionRow}>
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          style={action.variant === 'secondary' ? secondaryButton(primary) : primaryButton(brand)}
        >
          {action.label}
        </a>
      ))}
    </div>
  )
}

/** Emblem, title and message — the body every outcome card renders. */
export function OutcomeBody({
  tone,
  title,
  message,
}: {
  tone: CardTone
  title: string
  message: string
}) {
  const { Icon, accent } = TONES[tone]
  return (
    <>
      <div style={emblem}>
        <Icon size={44} color={accent} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 style={{ ...cardTitle, color: accent }}>{title}</h2>
      <p style={cardMessage}>{message}</p>
    </>
  )
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
const actionRow: CSSProperties = { marginTop: 24 }

const buttonBase: CSSProperties = {
  display: 'inline-block',
  margin: 6,
  padding: '12px 24px',
  borderRadius: 5,
  fontWeight: 'bold',
  fontSize: 15,
  textDecoration: 'none',
  cursor: 'pointer',
  border: 'none',
}
export function primaryButton(brand: EmailBrand): CSSProperties {
  const { primary, light } = brand.colors
  return {
    ...buttonBase,
    color: '#ffffff',
    backgroundColor: primary,
    backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${light} 100%)`,
  }
}
export function secondaryButton(primary: string): CSSProperties {
  return {
    ...buttonBase,
    color: primary,
    backgroundColor: '#ffffff',
    border: `1px solid ${primary}`,
  }
}
