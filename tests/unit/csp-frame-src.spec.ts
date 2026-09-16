import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * The admin's CSP `frame-src` must admit whatever `livePreview.url` points at.
 *
 * `headers()` runs at BUILD time, so it reads `process.env` rather than
 * `serverEnv` and cannot fail closed on a missing variable — it falls back to a
 * literal instead, on every local and CI build. A stale fallback is invisible:
 * the build succeeds, and the panel is blank only for whoever opens it.
 *
 * These pin the fallbacks to the production values `.env.example` documents.
 */

async function frameSrc(env: Record<string, string | undefined>): Promise<string> {
  const saved = { ...process.env }

  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })

  try {
    const headers = await nextConfig.headers!()
    const policy = headers[0]?.headers.find((h) => h.key === 'Content-Security-Policy')?.value

    return policy ?? ''
  } finally {
    process.env = saved
  }
}

describe('the admin CSP frame-src', () => {
  it('falls back to the atlas REPLACEMENT, never the legacy host', async () => {
    const policy = await frameSrc({ SAHAJATLAS_URL: undefined })

    expect(policy).toContain('https://sahajatlas.com')
    expect(policy).not.toContain('atlas.sydevelopers.com')
  })

  it('falls back to the We Meditate production host', async () => {
    const policy = await frameSrc({ WEMEDITATE_WEB_URL: undefined })

    expect(policy).toContain('https://wemeditate.com')
  })

  it('prefers the configured values over either fallback', async () => {
    const policy = await frameSrc({
      SAHAJATLAS_URL: 'http://localhost:5174',
      WEMEDITATE_WEB_URL: 'http://localhost:5173',
    })

    expect(policy).toContain('http://localhost:5174')
    expect(policy).toContain('http://localhost:5173')
    expect(policy).not.toContain('https://sahajatlas.com')
  })

  it("keeps 'self', so the live-preview-unavailable page still frames", async () => {
    // `livePreview.url` never returns null — it returns a same-origin
    // `/live-preview-unavailable?reason=…` instead, which needs 'self'.
    expect(await frameSrc({})).toContain("'self'")
  })
})
