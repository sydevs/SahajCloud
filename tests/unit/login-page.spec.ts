/**
 * The refusal pages' retry link (#838).
 *
 * `page.ts` builds HTML by hand, so every guard React would give for free has
 * to be written and asserted here.
 */
import { describe, expect, it } from 'vitest'

import { noticePage } from '@/plugins/login/page'

const bodyOf = (res: Response) => res.text()

describe('noticePage', () => {
  it('offers the retry link for a site-absolute path', async () => {
    const body = await bodyOf(noticePage(410, 'Expired', 'Ask again.', '/managers/signin'))

    expect(body).toContain('href="/managers/signin"')
    expect(body).toContain('Request a new link')
  })

  it('renders no link at all when no page is configured', async () => {
    const body = await bodyOf(noticePage(410, 'Expired', 'Ask again.'))

    expect(body).not.toContain('Request a new link')
    expect(body).not.toContain('<a')
  })

  it.each([
    ['javascript:alert(1)', 'a script URL'],
    ['//evil.example.com/signin', 'a protocol-relative off-origin URL'],
    ['https://evil.example.com/signin', 'an absolute off-origin URL'],
    ['managers/signin', 'a relative path'],
  ])('refuses %s (%s) rather than putting it behind the button', async (path) => {
    // These pages are unauthenticated and reached from an email, so the button
    // is exactly where an off-origin or script URL would do the most damage.
    // No caller can supply one today — the value is a module constant — so this
    // pins the guard for the next `LoginCollectionConfig`.
    const body = await bodyOf(noticePage(400, 'Invalid', 'Ask again.', path))

    expect(body).not.toContain('Request a new link')
    expect(body).not.toContain(path)
  })

  it('escapes a path rather than letting it close the attribute', async () => {
    const body = await bodyOf(noticePage(400, 'Invalid', 'Ask again.', '/a"><script>x</script>'))

    expect(body).not.toContain('<script>')
    expect(body).toContain('&quot;')
  })
})
