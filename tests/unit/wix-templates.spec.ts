import { describe, expect, it } from 'vitest'

import {
  CONTENT_ELEMENT_ID,
  isValidPrefix,
  prefixFromMount,
  routerFunctionBase,
  WIDGET_TAG_NAME,
  widgetSnippet,
  wixCustomElementSettings,
  wixPageCodeTemplate,
  wixRoutersTemplate,
} from '../../src/components/admin/InstallGuide/templates'

/**
 * The generated Wix snippets.
 *
 * ⚠ **Fixture pre-mortem.** `VALUES` assumes nothing about the real
 * configuration except that `cmsUrl` and `widgetUrl` are origins — the Install
 * view resolves them from `getServerUrl()` and `serverEnv.SAHAJATLAS_URL`
 * respectively, both of which are validated as URLs in `src/lib/env/server.ts`.
 * The one real coupling these cases pin is to the endpoint's own contract, which
 * lives in `src/endpoints/atlas/wix/` in this repo and is released with them.
 */

const VALUES = {
  apiKey: 'abc-123',
  prefix: 'free-classes',
  atlasUrl: '/free-classes',
  cmsUrl: 'https://cms.sahajatlas.com/',
  widgetUrl: 'https://sahajatlas.com/',
}

describe('routerFunctionBase', () => {
  it('turns hyphens into underscores, which Wix requires and a prefix allows', () => {
    // `free-classes_Router` is a syntax error; `freeClasses_Router` parses and
    // is never called. Both have to be impossible.
    expect(routerFunctionBase('free-classes')).toBe('free_classes')
    expect(routerFunctionBase('classes')).toBe('classes')
  })
})

describe('isValidPrefix', () => {
  it('takes one lowercase path segment', () => {
    expect(isValidPrefix('free-classes')).toBe(true)
    expect(isValidPrefix('classes')).toBe(true)
  })

  it('refuses what Wix or our own sitemap endpoint would', () => {
    expect(isValidPrefix('')).toBe(false)
    expect(isValidPrefix('Free-Classes')).toBe(false)
    expect(isValidPrefix('free classes')).toBe(false)
    expect(isValidPrefix('free/classes')).toBe(false)
    expect(isValidPrefix('-classes')).toBe(false)
    expect(isValidPrefix('classes-')).toBe(false)
    expect(isValidPrefix('a'.repeat(65))).toBe(false)
  })
})

describe('prefixFromMount', () => {
  it('offers the mount own first segment, which the endpoint assumes', () => {
    expect(prefixFromMount('/free-classes/')).toBe('free-classes')
    expect(prefixFromMount('/free-classes/map')).toBe('free-classes')
  })

  it('falls back to a usable default rather than an invalid prefix', () => {
    expect(prefixFromMount('/')).toBe('classes')
    expect(prefixFromMount(null)).toBe('classes')
    expect(prefixFromMount('/?p=42')).toBe('classes')
  })
})

describe('wixRoutersTemplate', () => {
  const source = wixRoutersTemplate(VALUES)

  it('names both functions the way Wix will look for them', () => {
    expect(source).toContain('export async function free_classes_Router(request)')
    expect(source).toContain('export async function free_classes_SiteMap(request)')
  })

  it('embeds the key and prefix as string literals, not interpolated bare', () => {
    expect(source).toContain(`const API_KEY = "abc-123"`)
    expect(source).toContain(`const PREFIX = "free-classes"`)
  })

  it('strips the trailing slash off the CMS origin, so no path doubles it', () => {
    expect(source).toContain(`const CMS_URL = "https://cms.sahajatlas.com"`)
    expect(source).not.toContain('https://cms.sahajatlas.com/"')
  })

  it('calls the endpoint this repo actually serves, with both parameters', () => {
    expect(source).toContain("'/api/atlas/wix/route?path='")
    expect(source).toContain("'&lang='")
    expect(source).toContain("'/api/atlas/wix/sitemap?prefix='")
  })

  it('maps each status onto the Velo call the endpoint documents', () => {
    expect(source).toContain('if (answer.status === 404) return notFound()')
    expect(source).toContain("return redirect('/' + PREFIX + answer.redirect, '301')")
    expect(source).toContain('cache: { tags: CACHE_TAGS, ttl: answer.cacheSeconds }')
  })

  it('reads the language off request.baseUrl, where a Multilingual site writes it', () => {
    expect(source).toContain('request.baseUrl')
  })

  it('renders a page on failure rather than a Wix error page', () => {
    expect(source).toContain('return degraded(route)')
    // Only the CMS's own answer may establish a 404.
    expect(source.match(/return notFound\(\)/g)).toHaveLength(1)
  })

  it('noindexes a degraded sub-route but not a degraded root', () => {
    expect(source).toContain(
      "if (route !== '/') head.metaTags = [{ name: 'robots', content: 'noindex' }]",
    )
  })

  it('leaves a failed sitemap read as the empty list rather than throwing', () => {
    // An empty sitemap is how a site asks to be de-indexed; Wix keeps what it has.
    expect(source).toContain('return []')
  })

  it('bounds the wait, since a visitor is held on it', () => {
    expect(source).toMatch(/const TIMEOUT_MS = \d+/)
    expect(source).toContain('timeout: TIMEOUT_MS')
  })
})

describe('wixPageCodeTemplate', () => {
  const source = wixPageCodeTemplate()

  it('fills the element the Install tab tells the volunteer to add', () => {
    expect(source).toContain(`$w('#${CONTENT_ELEMENT_ID}')`)
    expect(source).toContain('content.html = data.bodyHtml')
  })

  it('collapses rather than hides, so the map keeps its own box', () => {
    expect(source).toContain("if (rendering.env === 'browser') content.collapse()")
    expect(source).not.toContain('.hide()')
  })
})

describe('wixCustomElementSettings', () => {
  it('points the element at the widget loader with this service own key', () => {
    expect(wixCustomElementSettings(VALUES)).toEqual({
      serverUrl: 'https://sahajatlas.com/auto.js?key=abc-123',
      tagName: WIDGET_TAG_NAME,
    })
  })

  it('sends no routing parameter, which a router page must not do', () => {
    expect(wixCustomElementSettings(VALUES).serverUrl).not.toContain('routing=')
  })

  it('escapes a key that would otherwise break out of the query string', () => {
    const settings = wixCustomElementSettings({ ...VALUES, apiKey: 'a&b=c' })
    expect(settings.serverUrl).toBe('https://sahajatlas.com/auto.js?key=a%26b%3Dc')
  })
})

describe('widgetSnippet', () => {
  it('sizes the element, which is the opt-in for a contained map', () => {
    // An unsized element becomes position:fixed;inset:0 and covers the page
    // (sydevs/SahajAtlasWeb#170), so `display:block` and a definite height are
    // not styling — `min-height` would not do.
    const snippet = widgetSnippet(VALUES, { routing: false })
    expect(snippet).toContain('style="display:block;height:80vh"')
    expect(snippet).toContain(`<${WIDGET_TAG_NAME}`)
  })

  it('routes by path only where the host serves the whole subtree', () => {
    expect(widgetSnippet(VALUES, { routing: true })).toContain('&routing=path')
    expect(widgetSnippet(VALUES, { routing: false })).not.toContain('routing=')
  })

  it('loads the module, which the loader requires', () => {
    expect(widgetSnippet(VALUES, { routing: false })).toContain('type="module"')
  })
})
