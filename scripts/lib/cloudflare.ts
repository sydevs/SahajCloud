/**
 * The Cloudflare REST client the scripts here share.
 *
 * Three scripts hand-rolled this before `scripts/lib/` existed, and only one of
 * them knew the two rules below — so the other two swallowed the failures those
 * rules catch.
 *
 * ⚠ **`||`, not `&&`.** Cloudflare answers some failures `200` with
 * `success: false`, so a status test alone accepts them silently.
 *
 * ⚠ **A thrown `CloudflareError` carries the status**, which on an edge error
 * page is the only thing left that says what went wrong.
 */
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

export interface CloudflareEnvelope {
  errors?: { code?: number; message?: string }[]
  result?: unknown
  success?: boolean
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CloudflareError'
  }
}

/** Exit rather than throw: an operator reads a missing variable off the header, not a stack. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing required env var: ${name}. See this script's header for the full list.`)
    process.exit(1)
  }
  return value
}

export async function cfFetch(
  method: 'DELETE' | 'GET' | 'PUT',
  path: string,
  init?: { body?: string; contentType?: string },
): Promise<CloudflareEnvelope> {
  const res = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv('CLOUDFLARE_API_KEY')}`,
      ...(init?.body ? { 'Content-Type': init.contentType ?? 'application/json' } : {}),
    },
    body: init?.body,
  })

  // A KV write answers 200 with an empty body, and an edge error page is not
  // JSON at all, so neither shape may reach the caller as a parse failure.
  const text = await res.text()
  let parsed: CloudflareEnvelope = {}
  try {
    if (text) parsed = JSON.parse(text) as CloudflareEnvelope
  } catch {
    parsed = {}
  }

  if (!res.ok || parsed.success === false) {
    const detail = parsed.errors?.map((e) => `${e.code}: ${e.message}`).join('; ')
    throw new CloudflareError(
      `Cloudflare ${method} ${path}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`,
      res.status,
    )
  }
  return parsed
}
