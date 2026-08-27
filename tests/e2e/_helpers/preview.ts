import type { APIRequestContext } from '@playwright/test'

/**
 * Preview admin credentials.
 *
 * These authenticate against a deployed Railway PR preview (`PREVIEW_URL`), not
 * just localhost, so the password is a real secret and comes from CI secrets —
 * never from source. `password` is a getter so importing this module stays safe
 * for specs that never log in; the throw lands at first use with a message that
 * says what to set, instead of surfacing as an opaque 401.
 */
export const PREVIEW_ADMIN = {
  email: process.env.PREVIEW_ADMIN_EMAIL ?? 'contact@sydevelopers.com',
  get password(): string {
    const password = process.env.PREVIEW_ADMIN_PASSWORD
    if (!password) {
      throw new Error(
        'PREVIEW_ADMIN_PASSWORD is not set. Preview credentials come from CI secrets — set it in ' +
          'the workflow env (and the Railway service variables) before running the preview specs.',
      )
    }
    return password
  },
}

export function getBaseUrl(): string {
  return process.env.PREVIEW_URL ?? 'http://localhost:3000'
}

export async function loginAsAdmin(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/managers/login', { data: PREVIEW_ADMIN })
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`)
  }
  const body = (await res.json()) as { token?: string }
  if (!body.token) {
    throw new Error('login response missing token')
  }
  return body.token
}

/**
 * Ensure an admin exists on the preview database and return a JWT.
 *
 * A per-PR Railway preview starts with an empty database (only the schema from
 * the pre-deploy `payload migrate`), so there's no admin to log in as. Try to
 * log in; if that fails, create the first admin via Payload's `first-register`
 * endpoint (only succeeds while the auth collection is empty), then return its
 * token. Idempotent and safe against an already-seeded environment.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/managers/login', { data: PREVIEW_ADMIN })
  if (login.ok()) {
    const body = (await login.json()) as { token?: string }
    if (body.token) return body.token
  }
  const register = await request.post('/api/managers/first-register', {
    data: { ...PREVIEW_ADMIN, name: 'Preview Admin', type: 'admin' },
  })
  if (!register.ok()) {
    throw new Error(
      `ensureAdmin: first-register failed: ${register.status()} ${await register.text()}`,
    )
  }
  const body = (await register.json()) as { token?: string }
  return body.token ?? loginAsAdmin(request)
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
