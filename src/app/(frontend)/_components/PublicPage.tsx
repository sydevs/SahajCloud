import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { EmailBrand } from '@/plugins/email'

/**
 * The layout every public, logged-out page in this route group renders inside.
 *
 * ⚠ **A private folder, not a route.** Next excludes an `_`-prefixed segment
 * from routing, which is what lets shared UI sit beside the pages that use it.
 * A route folder is not a module home — importing this from `events/verify/`
 * was the cheaper option and the wrong one.
 *
 * ⚠ **Colour comes from the tokens in `styles.css`, never from a literal.**
 * That file redefines every token under `prefers-color-scheme: dark`, so an
 * inline `#fff` here is a white card on a dark page. A brand accent is the one
 * exception: it is the page's own identity, and it is passed in.
 *
 * Only the layout, the tone emblems and the button styles live here. Each page
 * keeps its own outcome and tone types, because what a page can conclude is its
 * own business: {@link PageTone} is the widest set, and a page narrows it.
 */

/** Every flavour the emblem can take. A page narrows this to what it can produce. */
export type PageTone = 'success' | 'warning' | 'error'

/** Outcome flavour → emblem icon + accent token. */
export const TONES: Record<PageTone, { Icon: LucideIcon; accent: string }> = {
  success: { Icon: CircleCheck, accent: 'var(--tone-success)' },
  warning: { Icon: Clock, accent: 'var(--tone-warning)' },
  error: { Icon: TriangleAlert, accent: 'var(--tone-error)' },
}

/** A button rendered under the message (`primary` filled, `secondary` outlined). */
export interface PageAction {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
}

/**
 * A minimal centred column under a logo — the whole chrome a public page gets.
 *
 * Neutral (no hooks, no server-only deps) so it renders in a server and a
 * client tree alike, and it takes a title string rather than a brand so the
 * home page can wear its own name.
 *
 * @param iconSrc Relative icon path (a local /public asset) — keeps next/image
 *   free of remote-pattern config.
 */
export function PublicPage({
  iconSrc,
  title,
  children,
}: {
  iconSrc: string
  title: string
  children: ReactNode
}) {
  return (
    <div style={frame}>
      <div style={column}>
        <Image alt="" height={64} priority src={iconSrc} style={logo} width={64} />
        <h1 style={productName}>{title}</h1>
        {children}
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

/** Emblem, title and message — the body every outcome page renders. */
export function OutcomeBody({
  tone,
  title,
  message,
}: {
  tone: PageTone
  title: string
  message: string
}) {
  const { Icon, accent } = TONES[tone]
  return (
    <>
      <div style={emblem}>
        <Icon size={44} color={accent} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 style={{ ...outcomeTitle, color: accent }}>{title}</h2>
      <p style={outcomeMessage}>{message}</p>
    </>
  )
}

const frame: CSSProperties = {
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '48px 20px',
}
const column: CSSProperties = { width: '100%', maxWidth: 420, textAlign: 'center' }
const logo: CSSProperties = { display: 'block', margin: '0 auto 16px', objectFit: 'contain' }
const productName: CSSProperties = {
  margin: '0 0 32px',
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
}

/** The prompt a page leads with, before anything has happened. */
export const pageHeading: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 20,
  color: 'var(--text)',
  textAlign: 'center',
}
/** @see pageHeading */
export const pageLead: CSSProperties = {
  margin: '0 0 20px',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  fontSize: 15,
  textAlign: 'center',
}

const emblem: CSSProperties = { fontSize: 44, lineHeight: 1, marginBottom: 12 }
const outcomeTitle: CSSProperties = { margin: '0 0 12px', fontSize: 20 }
// `pre-line` is load-bearing: the invalid-data verify outcome joins one line per
// failing field, and HTML would otherwise collapse them into one paragraph.
const outcomeMessage: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  fontSize: 15,
  whiteSpace: 'pre-line',
}
const actionRow: CSSProperties = { marginTop: 24 }

const buttonBase: CSSProperties = {
  display: 'inline-block',
  margin: 6,
  padding: '12px 24px',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 15,
  textDecoration: 'none',
  cursor: 'pointer',
  border: '1px solid transparent',
}
export function primaryButton(brand: EmailBrand): CSSProperties {
  return { ...buttonBase, color: '#ffffff', backgroundColor: brand.colors.primary }
}
export function secondaryButton(primary: string): CSSProperties {
  return {
    ...buttonBase,
    color: primary,
    backgroundColor: 'transparent',
    borderColor: 'var(--border)',
  }
}
