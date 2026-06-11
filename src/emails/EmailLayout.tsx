import type { CSSProperties, ReactNode } from 'react'

import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section } from 'react-email'

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

interface BrandButtonProps {
  href: string
  brand: EmailBrand
  children: ReactNode
}

/** Call-to-action button rendered in the project's brand gradient. */
export function BrandButton({ href, brand, children }: BrandButtonProps) {
  return (
    <Section style={buttonContainer}>
      <Button
        href={href}
        style={{
          ...button,
          backgroundColor: brand.colors.primary,
          backgroundImage: brandGradient(brand.colors),
        }}
      >
        {children}
      </Button>
    </Section>
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
  margin: '0 auto 12px',
  display: 'block',
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

const button: CSSProperties = {
  color: '#ffffff',
  padding: '14px 30px',
  borderRadius: '5px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
