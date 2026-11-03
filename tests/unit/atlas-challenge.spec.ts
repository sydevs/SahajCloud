import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

import {
  CHALLENGE_CHANNEL,
  CHALLENGE_SCRIPT,
  type ChallengeConfig,
  challengeDocument,
  TURNSTILE_SCRIPT_URL,
} from '@/endpoints/atlas/challenge/challengeDocument'
import {
  allowedParentHosts,
  builtInParentHosts,
  isParentAllowed,
  isTestSiteKey,
  parentOrigin,
  readChallengeRequest,
} from '@/endpoints/atlas/challenge/challengeRequest'

const PARENT = 'https://partner.org'

const RENDER: ChallengeConfig = {
  parent: PARENT,
  siteKey: '0x4AAAAtest',
  theme: 'dark',
  language: 'fr',
  probe: false,
}

type Posted = { message: Record<string, unknown>; targetOrigin: string }
type FakeScript = { src?: string; async?: boolean; onload?: () => void; onerror?: () => void }

/**
 * Runs `CHALLENGE_SCRIPT` exactly as the page does, against a fake window. It touches only
 * `window.parent`, `window.turnstile`, `window.addEventListener` and three `document` members, so
 * this is the whole surface — and the fake stands in for the browser's one guarantee this page
 * relies on, that a `postMessage` is delivered only to a window whose origin matches the target.
 */
function runPage(config: ChallengeConfig) {
  const posted: Posted[] = []
  const listeners: Array<(event: unknown) => void> = []
  const parentWindow = {
    postMessage: (message: Record<string, unknown>, targetOrigin: string) =>
      posted.push({ message, targetOrigin }),
  }
  const container = { id: 'challenge' }
  const scripts: FakeScript[] = []
  const window: Record<string, unknown> = {
    parent: parentWindow,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === 'message') listeners.push(listener)
    },
  }
  const document = {
    createElement: () => {
      const script: FakeScript = {}
      return script
    },
    getElementById: (id: string) => (id === 'challenge' ? container : null),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  }

  runInNewContext(`${CHALLENGE_SCRIPT}(${JSON.stringify(config)})`, { window, document })

  const turnstile = {
    render: vi.fn(
      (_container: unknown, _options: Record<string, unknown>): string | undefined => 'w1',
    ),
    reset: vi.fn(),
  }
  const load = (api: unknown = turnstile) => {
    window.turnstile = api
    scripts[0]?.onload?.()
  }
  const renderOptions = () =>
    turnstile.render.mock.calls[0]?.[1] as Record<string, (arg?: string) => void>
  const message = (event: Record<string, unknown>) =>
    listeners.forEach((listener) => listener(event))

  return { posted, scripts, container, parentWindow, turnstile, load, renderOptions, message }
}

describe('the challenge page script', () => {
  it('posts a refusal to any parent and loads nothing', () => {
    const page = runPage({ refusal: 'origin' })

    expect(page.scripts).toHaveLength(0)
    expect(page.posted).toEqual([
      {
        message: { type: 'error', reason: 'origin', channel: CHALLENGE_CHANNEL },
        targetOrigin: '*',
      },
    ])
  })

  it("loads Turnstile's script and hands back the handshake to the parent alone", () => {
    const page = runPage(RENDER)

    expect(page.scripts[0]?.src).toBe(TURNSTILE_SCRIPT_URL)
    page.load()
    expect(page.posted).toEqual([
      { message: { type: 'ready', channel: CHALLENGE_CHANNEL }, targetOrigin: PARENT },
    ])
  })

  it('renders the site key, theme and language into the page’s own container', () => {
    const page = runPage(RENDER)
    page.load()

    expect(page.turnstile.render).toHaveBeenCalledOnce()
    expect(page.turnstile.render.mock.calls[0]?.[0]).toBe(page.container)
    expect(page.turnstile.render.mock.calls[0]?.[1]).toMatchObject({
      sitekey: '0x4AAAAtest',
      theme: 'dark',
      language: 'fr',
    })
  })

  it('sends every token to the allowed parent origin, never to "*"', () => {
    const page = runPage(RENDER)
    page.load()
    page.renderOptions().callback?.('solved-token')
    page.renderOptions()['expired-callback']?.()
    page.renderOptions()['error-callback']?.()

    expect(page.posted.slice(1)).toEqual([
      {
        message: { type: 'token', token: 'solved-token', channel: CHALLENGE_CHANNEL },
        targetOrigin: PARENT,
      },
      { message: { type: 'expired', channel: CHALLENGE_CHANNEL }, targetOrigin: PARENT },
      { message: { type: 'error', channel: CHALLENGE_CHANNEL }, targetOrigin: PARENT },
    ])
    expect(page.posted.every(({ targetOrigin }) => targetOrigin === PARENT)).toBe(true)
  })

  it('renders nothing in probe mode, after the handshake', () => {
    const page = runPage({ ...RENDER, probe: true } as ChallengeConfig)
    page.load()

    expect(page.posted.map(({ message }) => message.type)).toEqual(['ready'])
    expect(page.turnstile.render).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the script fails to load',
      (page: ReturnType<typeof runPage>) => page.scripts[0]?.onerror?.(),
    ],
    ['the script defines no API', (page: ReturnType<typeof runPage>) => page.load(null)],
    [
      'Turnstile refuses to render',
      (page: ReturnType<typeof runPage>) => {
        page.turnstile.render.mockReturnValueOnce(undefined)
        page.load()
      },
    ],
  ])('reports an error when %s', (_case, act) => {
    const page = runPage(RENDER)
    act(page)

    expect(page.posted.at(-1)).toEqual({
      message: { type: 'error', channel: CHALLENGE_CHANNEL },
      targetOrigin: PARENT,
    })
  })

  it('resets only on a channel message from the parent window at the allowed origin', () => {
    const page = runPage(RENDER)
    page.load()
    const reset = { channel: CHALLENGE_CHANNEL, type: 'reset' }

    page.message({ source: {}, origin: PARENT, data: reset })
    page.message({ source: page.parentWindow, origin: 'https://evil.example', data: reset })
    page.message({ source: page.parentWindow, origin: PARENT, data: { type: 'reset' } })
    expect(page.turnstile.reset).not.toHaveBeenCalled()

    page.message({ source: page.parentWindow, origin: PARENT, data: reset })
    expect(page.turnstile.reset).toHaveBeenCalledExactlyOnceWith('w1')
  })
})

describe('challengeDocument', () => {
  it('bakes the config into one inline script, unable to close its own element', () => {
    const html = challengeDocument({ ...RENDER, language: '</script><script>alert(1)' })

    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('\\u003c/script>')
    expect(html).toContain('<div id="challenge"></div>')
  })
})

describe('parentOrigin', () => {
  it.each(['https://partner.org', 'http://localhost:5174', 'https://a.partner.org:8443'])(
    'accepts the bare origin %s',
    (origin) => expect(parentOrigin(origin)).toBe(origin),
  )

  it.each([
    undefined,
    '',
    'null',
    'https://partner.org/',
    'https://partner.org/page',
    'https://partner.org?x=1',
    'https://user@partner.org',
    'HTTPS://PARTNER.ORG',
    'ftp://partner.org',
    'javascript:alert(1)',
  ])('refuses %j, which is not what `location.origin` sends', (raw) => {
    expect(parentOrigin(raw)).toBeNull()
  })
})

describe('readChallengeRequest', () => {
  it('reads every parameter', () => {
    expect(
      readChallengeRequest({ parent: PARENT, theme: 'light', language: 'pt-BR', probe: '1' }),
    ).toEqual({ parent: PARENT, theme: 'light', language: 'pt-BR', probe: true })
  })

  it('falls back on an unknown theme or language rather than refusing', () => {
    expect(readChallengeRequest({ parent: PARENT, theme: 'neon', language: 'english' })).toEqual({
      parent: PARENT,
      theme: 'auto',
      language: 'auto',
      probe: false,
    })
  })

  it('takes the first of a repeated parameter', () => {
    expect(readChallengeRequest({ parent: [PARENT, 'https://evil.example'] }).parent).toBe(PARENT)
  })
})

describe('isTestSiteKey', () => {
  it.each(['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF'])(
    'recognises the dummy key %s',
    (key) => expect(isTestSiteKey(key)).toBe(true),
  )

  it.each(['0x4AAAAAAAB1cDeFgHiJkLmN', '1x0000AA', ''])('passes %j', (key) => {
    expect(isTestSiteKey(key)).toBe(false)
  })
})

describe('the parent allowlist', () => {
  const FIRST_PARTY = ['https://sahajatlas.com', 'https://wemeditate.com/map']

  it('admits both first-party frontends with their subdomains, the preview subdomain, and loopback', () => {
    expect(builtInParentHosts(FIRST_PARTY)).toEqual([
      'sahajatlas.com',
      '*.sahajatlas.com',
      'wemeditate.com',
      '*.wemeditate.com',
      '*.contact-c66.workers.dev',
      'localhost',
      '127.0.0.1',
    ])
  })

  it.each([
    'https://sahajatlas.com',
    'https://design.sahajatlas.com',
    'https://pr-355-sahajatlas-web.contact-c66.workers.dev',
    'https://pr-12-wemeditate-web.contact-c66.workers.dev',
    'http://localhost:61000',
    'http://127.0.0.1:5174',
    'https://partner.org',
    'https://www.other-partner.net',
  ])('allows %s', (parent) => {
    const patterns = allowedParentHosts(FIRST_PARTY, ['partner.org', '*.other-partner.net'])
    expect(isParentAllowed(parent, patterns)).toBe(true)
  })

  it.each([
    'https://www.example.org',
    'https://evil-partner.org',
    'https://other-partner.net',
    'https://partner.org.evil.example',
    // Another account's Workers subdomain, and the apex the wildcard must not reach.
    'https://pr-1-theirs.evil-c66.workers.dev',
    'https://contact-c66.workers.dev',
  ])('refuses %s', (parent) => {
    const patterns = allowedParentHosts(FIRST_PARTY, ['partner.org', '*.other-partner.net'])
    expect(isParentAllowed(parent, patterns)).toBe(false)
  })

  it('takes nothing from a client with an empty list — empty is not "any origin" here', () => {
    const patterns = allowedParentHosts(FIRST_PARTY, [null, '', '  '])

    expect(patterns).toEqual(builtInParentHosts(FIRST_PARTY))
    expect(isParentAllowed('https://partner.org', patterns)).toBe(false)
  })

  it('refuses a missing parent', () => {
    expect(isParentAllowed(null, ['*.org', 'localhost'])).toBe(false)
  })
})
