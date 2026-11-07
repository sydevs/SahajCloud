import { Text } from 'react-email'

import type { SeoCheckResult } from '@/lib/clients/verification'
import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, EmailLayout, styles } from './EmailLayout'

interface AtlasSeoWarningEmailProps {
  brand: EmailBrand
  siteName: string
  failures: readonly SeoCheckResult[]
  installUrl: string
}

const CHECK_LABELS: Record<SeoCheckResult['check'], string> = {
  title: 'the page title',
  canonical: 'the canonical link',
  'json-ld': 'the structured-data block',
  body: 'the text a search engine reads',
  sitemap: 'the page’s sitemap entry',
}

/**
 * One notice when a live atlas stops publishing the metadata we gave it (#1055).
 *
 * ⚠ **It opens by saying nobody visiting the site is affected**, because that is
 * true and it decides whether the reader panics or reads on.
 */
export function AtlasSeoWarningEmail({
  brand,
  siteName,
  failures,
  installUrl,
}: AtlasSeoWarningEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading="Search engines cannot read part of your atlas"
      previewText={`${failures.length} thing${failures.length === 1 ? '' : 's'} to fix on ${siteName}`}
    >
      <Text style={styles.paragraph}>
        The Sahaj Atlas is still showing on {siteName}, so nobody visiting the site is affected. But
        what a search engine reads is now missing something:
      </Text>

      {failures.map((failure) => (
        <Text key={`${failure.route}#${failure.check}`} style={styles.paragraph}>
          <strong>{failure.route === '/' ? 'The main page' : failure.route}</strong> —{' '}
          {CHECK_LABELS[failure.check]}
          {failure.detail ? `: ${failure.detail}` : ''}
        </Text>
      ))}

      <Text style={styles.hint}>
        Each line says what we expected and what the page says. The Install tab marks the setup step
        to redo, and the check beside it will say the same thing.
      </Text>

      <BrandButtonRow
        brand={brand}
        buttons={[{ href: installUrl, label: 'Open the Install tab' }]}
      />

      <Text style={styles.hint}>You will not get this email again for the same problem.</Text>
    </EmailLayout>
  )
}
