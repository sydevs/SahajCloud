import type { ReactElement } from 'react'

import { render, toPlainText } from 'react-email'

/**
 * Added to react-email's own selectors, which already skip images and the
 * preheader and print each link's URL beside its text.
 */
const TEXT_SELECTORS = [
  // Columns sit side by side, so without a gap a label runs into its value.
  {
    selector: 'td[data-id="__react-email-column"]',
    format: 'inlineSurround',
    options: { suffix: ' ' },
  },
  // A `Button` (the one anchor carrying `mso-padding-alt`) can sit beside
  // another in a row, so its URL needs a gap after it too.
  {
    selector: 'a[style*="mso-padding-alt"]',
    format: 'anchor',
    options: { linkBrackets: ['', ' '] },
  },
  // A `mailto:` href only repeats the address its text already shows…
  { selector: 'a[href^="mailto:"]', format: 'anchor', options: { ignoreHref: true } },
  // …or, with a query, is a URL-encoded reply body.
  { selector: 'a[href^="mailto:"][href*="?"]', format: 'inlineSurround', options: { suffix: ' ' } },
]

/**
 * Render a React Email template to inline HTML and the plain-text part derived
 * from it.
 *
 * Every send carries both: a message with no text part scores worse with spam
 * filters and shows nothing in a text-only client. `toPlainText` is what
 * `render(element, { plainText: true })` runs, applied to the one render.
 */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const html = await render(element)
  return { html, text: toPlainText(html, { selectors: TEXT_SELECTORS }) }
}
