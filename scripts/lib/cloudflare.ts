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

  const text = await res.text()
  let parsed: CloudflareEnvelope = {}
  if (text) {
    try {
      parsed = JSON.parse(text) as CloudflareEnvelope
    } catch {
      // ⚠ **An empty body is fine; an unparseable one is not.** A KV write
      // answers 200 with nothing, so `{}` has to be a valid reading of that —
      // but reading an edge error page the same way hands the caller an empty
      // envelope, and `setup-stream-webhook.ts` would take it for "nothing
      // registered" and overwrite the live webhook without `--force`.
      throw new CloudflareError(
        `Cloudflare ${method} ${path}: HTTP ${res.status}, and the body is not JSON`,
        res.status,
      )
    }
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
