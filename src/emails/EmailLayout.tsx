import type { CSSProperties, ReactNode } from 'react'

import { Fragment } from 'react'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from 'react-email'

import type { BrandColors } from '@/lib/branding'
import { readableTextOn } from '@/lib/branding'
import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import type { EmailStrings } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

/**
 * Non-breaking space, spelled out rather than typed literally: it is the only
 * thing holding an empty table cell open in Outlook, and a bare literal in the
 * source is invisible enough that a later edit would quietly replace it with a
 * plain space — which HTML collapses, taking the cell with it.
 */
export const NBSP = '\u00A0'

/** Diagonal brand gradient shared by the header and CTA buttons. */
export const brandGradient = (colors: BrandColors): string =>
  `linear-gradient(135deg, ${colors.primary} 0%, ${colors.light} 100%)`

/**
 * The text colour the header title and a filled button take on that gradient.
 *
 * ⚠ **`primary` is passed first because it is the only stop that always
 * paints.** Both sites set it as `backgroundColor` under the gradient's
 * `backgroundImage`, and Outlook desktop drops the image — so a text colour
 * chosen by the light stop alone is chosen by a surface those readers never
 * see. `readableTextOn` lets `primary` decide wherever both colours stay
 * legible across the gradient, and falls back to the worse stop where they do
 * not. A service's colours are never changed for this — only the text on them.
 */
export const brandTextColor = (colors: BrandColors): string =>
  readableTextOn(colors.primary, colors.light)

/**
 * Neutral, non-brand structural styles shared across templates. Brand colors
 * never appear here — they are resolved per-send from `EmailBrand`.
 */
export const styles = {
  paragraph: { fontSize: '16px', margin: '0 0 16px' },
  hint: { fontSize: '14px', color: '#666666', margin: '0 0 16px' },
  // `word-wrap` too: AOL, GMX and Windows Mail ignore `word-break`, and an
  // unbroken fallback URL then widens the whole email on a phone.
  link: { wordBreak: 'break-all', wordWrap: 'break-word' },
  footer: { fontSize: '12px', color: '#999999', margin: 0 },
  hr: { borderColor: '#dddddd', margin: '30px 0' },
} satisfies Record<string, CSSProperties>

const labelColumn: CSSProperties = {
  width: '38%',
  padding: '8px 12px',
  verticalAlign: 'top',
  color: '#6b7280',
  fontWeight: 600,
  fontSize: '14px',
  borderBottom: '1px solid #eef0f2',
}
const valueColumn: CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
  color: '#1f2937',
  fontSize: '14px',
  borderBottom: '1px solid #eef0f2',
}

/**
 * A label/value line for the fact tables both the verification and registration
 * emails render. Built from ReactEmail's Row + Column primitives.
 */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row>
      <Column style={labelColumn}>{label}</Column>
      <Column style={valueColumn}>{children}</Column>
    </Row>
  )
}

/** A label-above-value itinerary line. */
function StackedDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Section style={stackedRow}>
      <Text style={stackedLabel}>{label}</Text>
      <Text style={stackedValue}>{children}</Text>
    </Section>
  )
}

/**
 * The guest itinerary card both registrant emails open with — the class, when,
 * where and who — then its one call to action.
 *
 * Only the online CTA repeats its URL as plain text: a client that strips the
 * button would leave the join link unrecoverable, whereas the venue address is
 * already in the card.
 */
export function EventItinerary({
  brand,
  details,
  strings,
  when = details.scheduleLine,
}: {
  brand: EmailBrand
  details: RegistrationEmailDetails
  strings: EmailStrings
  when?: ReactNode
}) {
  const { location } = details
  const accent = brand.colors.primary
  return (
    <>
      <Section style={detailBlock}>
        <Heading as="h3" style={eventTitle}>
          {details.eventTitle}
        </Heading>
        <StackedDetailRow label={strings.when_label}>{when}</StackedDetailRow>
        {location.type === 'offline' ? (
          <StackedDetailRow label={strings.where_label}>{location.address}</StackedDetailRow>
        ) : null}
        {details.contact ? (
          <StackedDetailRow label={strings.contact_label}>{details.contact}</StackedDetailRow>
        ) : null}
      </Section>

      {location.type === 'online' ? (
        <>
          <BrandButton href={location.joinUrl} brand={brand}>
            {strings.online_cta}
          </BrandButton>
          <Text style={styles.hint}>
            {strings.online_link_hint}
            <br />
            <Link href={location.joinUrl} style={{ ...styles.link, color: accent }}>
              {location.joinUrl}
            </Link>
          </Text>
        </>
      ) : null}

      {location.type === 'offline' && location.mapsUrl ? (
        <BrandButton href={location.mapsUrl} brand={brand}>
          {strings.directions_cta}
        </BrandButton>
      ) : null}
    </>
  )
}

/** Question-and-answer pairs, each question above its answer; `compact` inside a table row. */
export function AnswerPairs({
  answers,
  compact,
}: {
  answers: { label: string; value: string }[]
  compact?: boolean
}) {
  // Keyed by position: a form can ask the same question twice.
  return answers.map((answer, index) => (
    <Fragment key={index}>
      <Text style={compact ? compactQuestion : answerQuestion}>{answer.label}</Text>
      <Text style={compact ? compactValue : answerValue}>{answer.value}</Text>
    </Fragment>
  ))
}

/** Forwarded question-and-answer pairs under one heading; nothing when there are none. */
export function AnswerList({
  answers,
  heading,
}: {
  answers: { label: string; value: string }[]
  heading: string
}) {
  if (answers.length === 0) return null
  return (
    <Section>
      <SectionHeading>{heading}</SectionHeading>
      <AnswerPairs answers={answers} />
    </Section>
  )
}

type BrandButtonVariant = 'primary' | 'secondary'

/** Fill + border for a button variant: filled brand gradient, or an outlined secondary. */
function brandButtonVariantStyle(brand: EmailBrand, variant: BrandButtonVariant): CSSProperties {
  return variant === 'secondary'
    ? {
        color: brand.colors.primary,
        backgroundColor: '#ffffff',
        border: `1px solid ${brand.colors.primary}`,
      }
    : {
        color: brandTextColor(brand.colors),
        backgroundColor: brand.colors.primary,
        backgroundImage: brandGradient(brand.colors),
      }
}

interface BrandButtonProps {
  href: string
  brand: EmailBrand
  children: ReactNode
  /** `primary` (filled brand gradient) or `secondary` (outlined). */
  variant?: BrandButtonVariant
  /** Trim the top margin so a secondary button sits close under the primary. */
  tight?: boolean
}

/** Call-to-action button — filled brand gradient, or an outlined secondary. */
export function BrandButton({
  href,
  brand,
  children,
  variant = 'primary',
  tight,
}: BrandButtonProps) {
  const variantStyle = brandButtonVariantStyle(brand, variant)

  return (
    <Section style={tight ? buttonContainerTight : buttonContainer}>
      <Button href={href} style={{ ...button, ...variantStyle }}>
        {children}
      </Button>
    </Section>
  )
}

interface BrandButtonRowProps {
  brand: EmailBrand
  /** Buttons rendered inline and centered together as a group. */
  buttons: { href: string; label: ReactNode; variant?: BrandButtonVariant }[]
}

/**
 * A row of call-to-action buttons centered together (inline-block in a centered
 * cell), rather than spread across the width. Use for 2–3 short actions.
 */
export function BrandButtonRow({ brand, buttons }: BrandButtonRowProps) {
  return (
    <Section style={buttonContainer}>
      {buttons.map((cta, index) => (
        <Button
          key={index}
          href={cta.href}
          style={{
            ...button,
            ...brandButtonVariantStyle(brand, cta.variant ?? 'primary'),
            ...buttonInRow,
          }}
        >
          {cta.label}
        </Button>
      ))}
    </Section>
  )
}

/**
 * A horizontal progress bar with its own "N of M" caption.
 *
 * Built from `Row`/`Column` (i.e. a real `<table>`) with `backgroundColor` on
 * the cells, because that is the one fill technique every client renders —
 * Outlook's Word engine drops CSS backgrounds on a styled `<div>`, and no email
 * client can be relied on for `<progress>` or a gradient. A zero-width cell is
 * omitted rather than emitted at `width: 0%`, which some clients round up to a
 * visible sliver: an empty bar would otherwise show a stub of "complete".
 */
export function ProgressBar({
  resolved,
  total,
  color,
  caption,
}: {
  resolved: number
  total: number
  /** Fill colour — pass the brand primary so the bar reads as "ours". */
  color: string
  /** Text beside the bar, e.g. "2 of 4 complete". */
  caption: string
}) {
  const percent = total > 0 ? Math.round((resolved / total) * 100) : 0
  // Height comes from line-height: an empty table cell collapses in Outlook,
  // so each cell carries a non-breaking space sized to the bar instead.
  const cell: CSSProperties = { height: '8px', fontSize: '1px', lineHeight: '8px' }

  return (
    <Section style={{ margin: '0 0 14px' }}>
      <Row>
        {percent > 0 ? (
          <Column style={{ ...cell, width: `${percent}%`, backgroundColor: color }}>{NBSP}</Column>
        ) : null}
        {percent < 100 ? (
          <Column style={{ ...cell, width: `${100 - percent}%`, backgroundColor: '#e5e7eb' }}>
            {NBSP}
          </Column>
        ) : null}
      </Row>
      <Text style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0', fontWeight: 600 }}>
        {caption}
      </Text>
    </Section>
  )
}

/** Small uppercase label above a detail table (Event details, Registration answers, …). */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h3" style={sectionHeading}>
      {children}
    </Heading>
  )
}

interface EmailLayoutProps {
  brand: EmailBrand
  /** Card heading shown above the body content. */
  heading?: string
  /** Inbox-preview snippet (hidden in the rendered body). */
  previewText?: string
  children: ReactNode
  /** Small print under a rule, closing the card. */
  footer?: ReactNode
}

/**
 * Shared transactional-email shell: gradient brand header, card body, footer.
 *
 * Every brand token (color, product name, icon) comes from `brand`, so a new
 * email is just its body content and a project never appears hardcoded.
 */
export function EmailLayout({ brand, heading, previewText, children, footer }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      {previewText ? <Preview>{previewText}</Preview> : null}
      <Body style={main}>
        <Container style={container}>
          <Section
            style={{
              ...header,
              backgroundColor: brand.colors.primary,
              backgroundImage: brandGradient(brand.colors),
            }}
          >
            {brand.iconUrl ? (
              <Img
                src={brand.iconUrl}
                alt={brand.productName}
                width="48"
                height="48"
                style={icon}
              />
            ) : null}
            <Heading style={{ ...headerTitle, color: brandTextColor(brand.colors) }}>
              {brand.productName}
            </Heading>
          </Section>
          <Section style={card}>
            {heading ? (
              <Heading as="h2" style={cardHeading}>
                {heading}
              </Heading>
            ) : null}
            {children}
            {footer ? (
              <>
                <Hr style={styles.hr} />
                <Text style={styles.footer}>{footer}</Text>
              </>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// ⚠ Inline only, never a media query: react-email moves a Section's padding
// onto an inner `<td>` a class cannot reach in every client. The side padding is
// what a phone loses three times over, so it is kept narrow everywhere — the
// 600px container already centres itself on a wide screen.
const main: CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  color: '#333333',
  lineHeight: '1.6',
  padding: '20px 0',
}

const container: CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
}

const header: CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
  borderRadius: '8px 8px 0 0',
}

const icon: CSSProperties = {
  display: 'block',
  margin: '0 auto 12px',
  padding: '8px',
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  objectFit: 'contain',
}

const headerTitle: CSSProperties = {
  margin: 0,
  fontSize: '24px',
}

const card: CSSProperties = {
  backgroundColor: '#f9f9f9',
  padding: '28px 20px',
  borderRadius: '0 0 8px 8px',
}

// ⚠ Text colour, never the brand's: the brand colour is how a reader tells a link.
const cardHeading: CSSProperties = {
  marginTop: 0,
  fontSize: '20px',
  color: '#1f2937',
}

const buttonContainer: CSSProperties = {
  textAlign: 'center',
  margin: '30px 0',
}

const buttonContainerTight: CSSProperties = {
  textAlign: 'center',
  margin: '0 0 30px',
}

// A small horizontal gap between buttons sitting inline in a centered row.
const buttonInRow: CSSProperties = {
  margin: '0 6px',
}

const button: CSSProperties = {
  padding: '14px 30px',
  borderRadius: '5px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}

// Small uppercase section label. Shared so every template's section headers
// (Event details, Registration answers, Event manager, …) match. The generous
// top margin separates a section from the content above it.
const sectionHeading: CSSProperties = {
  margin: '28px 0 10px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

// Guest-itinerary stacked row: brand-coloured uppercase label above its value.
const stackedRow: CSSProperties = { margin: '16px 0' }
const stackedLabel: CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  margin: '0 0 4px',
}
const stackedValue: CSSProperties = { fontSize: '16px', margin: 0 }

const detailBlock: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '6px',
  padding: '4px 16px',
  margin: '0 0 24px',
}
// Neutral rather than the brand accent, which the links and the CTA carry.
const eventTitle: CSSProperties = { fontSize: '18px', color: '#333333', margin: '16px 0 0' }

const answerQuestion: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151',
  margin: '0 0 2px',
}
const answerValue: CSSProperties = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
}
const compactQuestion: CSSProperties = { ...answerQuestion, color: '#6b7280', fontSize: '12px' }
const compactValue: CSSProperties = { ...answerValue, fontSize: '13px', margin: '0 0 6px' }
