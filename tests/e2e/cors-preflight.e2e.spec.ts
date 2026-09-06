import { expect, test } from '@playwright/test'

/**
 * #575 — a real CORS preflight against the deployed preview. The Atlas widget
 * fetches drafts client-side with the `x-sahajcloud-preview-secret` header, so
 * the browser's preflight must see that header in the allow-list. Credentials
 * must stay off (#509). Mirrors the preflight the widget origin actually sends.
 */
test('CORS preflight allows the live-preview secret header without credentials', async ({
  request,
}) => {
  const res = await request.fetch('/api/events', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://atlas-widget.example.org',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization, x-sahajcloud-preview-secret',
    },
  })

  expect(res.ok()).toBe(true)
  const headers = res.headers()
  const allowed = (headers['access-control-allow-headers'] ?? '').toLowerCase()
  expect(allowed).toContain('x-sahajcloud-preview-secret')
  expect(allowed).toContain('authorization')
  expect(headers['access-control-allow-origin']).toBe('*')
  expect(headers['access-control-allow-credentials']).toBeUndefined()
})
