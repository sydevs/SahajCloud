import type { CSSProperties, ReactNode } from 'react'

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Row,
  Section,
} from 'react-email'

import type { BrandColors } from '@/lib/branding'
import type { EmailBrand } from '@/plugins/email'

/** Diagonal brand gradient shared by the header and CTA buttons. */
export const brandGradient = (colors: BrandColors): string =>
  `linear-gradient(135deg, ${colors.primary} 0%, ${colors.light} 100%)`

/**
 * Neutral, non-brand structural styles shared across templates. Brand colors
 * never appear here — they are resolved per-send from `EmailBrand`.
 */
export const styles = {
  paragraph: { fontSize: '16px', margin: '0 0 16px' },
  hint: { fontSize: '14px', color: '#666666', margin: '0 0 16px' },
  link: { wordBreak: 'break-all' },
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
        color: '#ffffff',
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
}

/**
 * Shared transactional-email shell: gradient brand header, card body, footer.
 *
 * Every brand token (color, product name, icon) comes from `brand`, so a new
 * email is just its body content and a project never appears hardcoded.
 */
export function EmailLayout({ brand, heading, previewText, children }: EmailLayoutProps) {
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
            <Heading style={headerTitle}>{brand.productName}</Heading>
          </Section>
          <Section style={card}>
            {heading ? (
              <Heading as="h2" style={{ ...cardHeading, color: brand.colors.primary }}>
                {heading}
              </Heading>
            ) : null}
            {children}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main: CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  color: '#333333',
  lineHeight: '1.6',
  padding: '20px',
}

const container: CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
}

const header: CSSProperties = {
  padding: '30px',
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
  color: '#ffffff',
  margin: 0,
  fontSize: '24px',
}

const card: CSSProperties = {
  backgroundColor: '#f9f9f9',
  padding: '30px',
  borderRadius: '0 0 8px 8px',
}

const cardHeading: CSSProperties = {
  marginTop: 0,
  fontSize: '20px',
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
  color: '#ffffff',
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
