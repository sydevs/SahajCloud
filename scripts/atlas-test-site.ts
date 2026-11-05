/**
 * A host site on localhost for exercising the Install tab's checks end to end.
 *
 *   NODE_EXTRA_CA_CERTS=<printed path> <restart the dev server>
 *   pnpm tsx scripts/atlas-test-site.ts --client <id> [--path /classes]
 *                                       [--break title,canonical,json-ld,body,sitemap,marker]
 *
 * It plays a correctly installed custom site at `https://localhost<path>`:
 * every address under the path serves one page whose `<head>` and body come
 * from `GET /api/atlas/seo`, with the widget's readiness marker on `<html>`, and
 * `/robots.txt` and `/sitemap.xml` list what `GET /api/atlas/sitemap` answers.
 * It reports the mount when it starts and on every page view, as the widget
 * does on a visitor's page load. `--break` leaves parts out, so the tab shows the
 * matching failures.
 *
 * Then: open the service's Install tab, choose "Custom site", and paste
 * `https://localhost<path>`. The tab confirms it by itself; Check again re-runs it.
 *
 * ⚠ **https on 443, because a canonical host can be nothing else.** A canonical
 * URL is always `https://` plus a bare host (`src/lib/atlas/canonicalUrl.ts`),
 * so a site on `http://localhost:4610` could be reported but never verified. The
 * certificate is self-signed and generated on first run; the dev server trusts
 * it through `NODE_EXTRA_CA_CERTS`, which Node reads only at startup — hence the
 * restart. macOS lets an ordinary user bind 443.
 *
 * ⚠ **Only against a local `next dev`.** Cloudflare cannot reach localhost, so
 * verification fetches the page directly there instead (`isLocalDevTarget` in
 * `src/lib/embedVerification/browserRendering.ts`). The service needs
 * `localhost` in its allowed domains and a region; the API key is read through
 * the dev server's auto-login.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import type { AtlasSeoResponse, AtlasSitemapResponse } from '../src/endpoints/responseTypes'

const BREAKABLE = ['title', 'canonical', 'json-ld', 'body', 'sitemap', 'marker'] as const
type Breakable = (typeof BREAKABLE)[number]

const { values: args } = parseArgs({
  options: {
    client: { type: 'string' },
    path: { type: 'string', default: '/classes' },
    break: { type: 'string', default: '' },
  },
})

const cms = (process.env.SAHAJCLOUD_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(
  /\/+$/,
  '',
)
const origin = 'https://localhost'
const mountPath = `/${args.path.split('/').filter(Boolean).join('/')}`
const broken = new Set(
  args.break
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is Breakable => (BREAKABLE as readonly string[]).includes(part)),
)

if (!args.client) {
  console.error(
    'Pass --client <id>: the service to install, with localhost in its allowed domains.',
  )
  process.exit(1)
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** The service's key, read the way the Install tab reads it — as the dev server's auto-login admin. */
async function revealKey(clientId: string): Promise<string> {
  const response = await fetch(`${cms}/api/clients/${clientId}/api-key/reveal`, { method: 'POST' })
  const body = (await response.json().catch(() => null)) as { apiKey?: string } | null
  if (!response.ok || !body?.apiKey) {
    throw new Error(
      `Could not read the API key for service ${clientId} (${response.status}). Is ${cms} a local dev server, and does the service have a key?`,
    )
  }
  return body.apiKey
}

/** A self-signed certificate for localhost, made once and kept outside the repo. */
function certificate(): { cert: string; key: string; certPath: string } {
  const dir = join(
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
    'sahajcloud-atlas-test-site',
  )
  const certPath = join(dir, 'localhost.pem')
  const keyPath = join(dir, 'localhost-key.pem')
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    mkdirSync(dir, { recursive: true })
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '825',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    )
  }
  return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8'), certPath }
}

const tls = certificate()
const apiKey = await revealKey(args.client)

/** A request to the CMS as the service itself, from this site's origin. */
const asClient = (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${cms}${path}`, {
    ...init,
    headers: {
      Authorization: `clients API-Key ${apiKey}`,
      // Without this the dev server reads every request as its auto-login admin.
      DisableAutologin: 'true',
      Origin: origin,
      ...(init.headers ?? {}),
    },
  })

/** What the widget sends on every page view. */
async function report(): Promise<void> {
  const response = await asClient('/api/clients/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      pathname: mountPath,
      mode: 'inline',
      topLevel: true,
      urlWritable: true,
      paramPersisted: false,
      routing: 'path',
    }),
  })
  if (!response.ok) console.warn(`report → ${response.status} ${await response.text()}`)
}

function renderPage(seo: AtlasSeoResponse, pageUrl: string): string {
  const marker = escapeHtml(
    JSON.stringify({ v: 1, routing: 'path', topLevel: true, urlWritable: true }),
  )
  const head = [
    broken.has('title')
      ? '<title>A page about something else</title>'
      : `<title>${escapeHtml(seo.title)}</title>`,
    seo.description ? `<meta name="description" content="${escapeHtml(seo.description)}">` : '',
    broken.has('canonical')
      ? ''
      : `<link rel="canonical" href="${escapeHtml(seo.canonical ?? pageUrl)}">`,
    // `jsonLd` arrives escaped for exactly this sink.
    broken.has('json-ld') ? '' : `<script type="application/ld+json">${seo.jsonLd}</script>`,
  ]

  const lines: string[] = []
  if (seo.type === 'root') lines.push(...seo.content.paragraphs)
  if (seo.type === 'region') {
    if (seo.content.subtitle) lines.push(seo.content.subtitle)
    lines.push(...seo.content.events.map((card) => card.title))
  }
  if (seo.type === 'event') {
    lines.push(seo.content.schedule.oneLine, seo.content.address?.oneLine ?? '')
    lines.push(...seo.content.paragraphs)
  }
  const body = broken.has('body')
    ? ''
    : lines
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('\n')

  return `<!doctype html>
<html lang="${escapeHtml(seo.locale)}"${broken.has('marker') ? '' : ` data-sahaj-atlas-ready="${marker}"`}>
<head><meta charset="utf-8">${head.join('\n')}</head>
<body>
<h1>Local Sahaj Atlas test site</h1>
<sahaj-atlas style="display:block;height:80vh"></sahaj-atlas>
${body}
</body>
</html>`
}

async function sitemapXml(): Promise<string | null> {
  const response = await asClient('/api/atlas/sitemap')
  if (!response.ok) return null
  const { urls } = (await response.json()) as AtlasSitemapResponse
  const entries = [`${origin}${mountPath}`, ...urls.map((url) => url.loc)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((loc) => `<url><loc>${escapeHtml(loc)}</loc></url>`).join('\n')}
</urlset>`
}

const server = createServer({ cert: tls.cert, key: tls.key }, (request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', origin)
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` })
      response.end(body)
    }

    if (url.pathname === '/robots.txt') {
      return send(
        200,
        'text/plain',
        broken.has('sitemap') ? '' : `Sitemap: ${origin}/sitemap.xml\n`,
      )
    }
    if (url.pathname === '/sitemap.xml') {
      const xml = broken.has('sitemap') ? null : await sitemapXml()
      return xml ? send(200, 'application/xml', xml) : send(404, 'text/plain', 'No sitemap.')
    }

    const inMount = url.pathname === mountPath || url.pathname.startsWith(`${mountPath}/`)
    if (!inMount) return send(404, 'text/html', '<!doctype html><title>Not found</title>')

    const route = url.pathname.slice(mountPath.length) || '/'
    // A routing probe asks for an address nothing links to: it only needs the
    // page, which is what a host serving the whole subtree answers.
    const seoResponse = await asClient(`/api/atlas/seo?route=${encodeURIComponent(route)}`)
    if (!seoResponse.ok) {
      const fallback = await asClient('/api/atlas/seo?route=/')
      if (!fallback.ok) return send(502, 'text/plain', `CMS answered ${seoResponse.status}.`)
      void report()
      return send(
        200,
        'text/html',
        renderPage((await fallback.json()) as AtlasSeoResponse, url.href),
      )
    }

    void report()
    send(200, 'text/html', renderPage((await seoResponse.json()) as AtlasSeoResponse, url.href))
  })().catch((error: unknown) => {
    console.error(error)
    response.writeHead(500)
    response.end()
  })
})

server.listen(443, () => {
  console.log(`Test site for service ${args.client}: ${origin}${mountPath}`)
  console.log(
    `CMS: ${cms}${broken.size > 0 ? `  Broken on purpose: ${[...broken].join(', ')}` : ''}`,
  )
  if (!process.env.NODE_EXTRA_CA_CERTS) {
    console.log(
      `The dev server must trust this site: restart it with NODE_EXTRA_CA_CERTS=${tls.certPath}`,
    )
  }
  void report()
})
