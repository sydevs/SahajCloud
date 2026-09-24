/**
 * The two pages the redeem route serves to a browser.
 *
 * Everything else in this plugin answers JSON, because a machine calls it. The
 * redeem route is the one a person reaches from their mail client, so a refusal
 * has to read as a sentence rather than as an error envelope.
 */

/** Escapes text destined for an HTML body or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * ⚠ `no-store` and `noindex` are both load-bearing: the URL carries the
 * credential in its query string, so neither a shared cache nor a crawler may
 * keep a copy. `no-referrer` stops the token reaching the redirect target as a
 * `Referer`.
 */
const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}

const STYLE = `
  :root { color-scheme: light dark; }
  body {
    align-items: center; display: flex; justify-content: center;
    font: 16px/1.5 system-ui, sans-serif; margin: 0; min-height: 100vh; padding: 1.5rem;
  }
  main { max-width: 26rem; text-align: center; }
  h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
  p { margin: 0 0 1.5rem; opacity: 0.8; }
  button, .button {
    background: #0b6; border: 0; border-radius: 0.375rem; color: #fff; cursor: pointer;
    display: inline-block; font: inherit; font-weight: 600; padding: 0.75rem 1.75rem;
    text-decoration: none;
  }
`

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<meta name="robots" content="noindex, nofollow">` +
      `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
      `<body><main>${body}</main></body></html>`,
    { status, headers: HEADERS },
  )
}

/**
 * A refusal a person can act on.
 *
 * ⚠ **`retryHref` is what makes "request a new sign-in link" actionable.** Every
 * refusal here says it, and a dead end that says it without offering it is the
 * failure the 404 on these routes was already rejected for (#838). It is
 * omitted only while the served collection names no request page.
 */
export function noticePage(
  status: number,
  heading: string,
  message: string,
  retryHref?: string,
): Response {
  const retry = retryHref
    ? `<p><a class="button" href="${escapeHtml(retryHref)}">Request a new link</a></p>`
    : ''
  return page(
    status,
    heading,
    `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p>${retry}`,
  )
}

/**
 * The interstitial that stands between a delivered link and the session it buys.
 *
 * ⚠ **A plain form with no script is the whole defence.** The point is that
 * spending the link takes a method a link-scanner does not use and a click it
 * does not make, so anything that would submit this automatically — an
 * `onload`, a timer, a redirect — puts the hazard straight back.
 */
export function confirmPage(actionUrl: string): Response {
  return page(
    200,
    'Confirm sign-in',
    `<h1>Sign in to SahajCloud</h1>` +
      `<p>Confirm it is you. This link works once.</p>` +
      `<form method="post" action="${escapeHtml(actionUrl)}">` +
      `<button type="submit">Sign in</button></form>`,
  )
}
