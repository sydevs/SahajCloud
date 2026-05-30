import type { APIRequestContext } from '@playwright/test'

export const PREVIEW_ADMIN = {
  email: 'contact@sydevelopers.com',
  password: 'evk1VTH5dxz_nhg-mzk',
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

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
