import { describe, expect, it } from 'vitest'

import {
  actionText,
  allSteps,
  hostHints,
  type PlatformId,
  PLATFORM_LABELS,
  readAtlasAddress,
  signalFor,
  snippetsOf,
  stepForCheck,
  type TrackId,
  TRACKS_BY_PLATFORM,
  tracksFor,
  WORDPRESS_DEFAULT_PATH,
  WORDPRESS_PLUGIN_ZIP_URL,
} from '../../src/components/admin/InstallGuide/steps'
import { CONTENT_ELEMENT_ID } from '../../src/components/admin/InstallGuide/templates'

/**
 * The Install tab's content, and the couplings a component cannot check.
 *
 * ⚠ **Fixture pre-mortem.** `VALUES` is the real `InstallValues`, so a key added
 * to that type is a compile error here rather than a track silently rendering
 * `undefined` into a snippet a volunteer then pastes.
 */

const VALUES = {
  apiKey: 'abc-123',
  prefix: 'free-classes',
  atlasUrl: '/free-classes',
  cmsUrl: 'https://cms.sahajatlas.com',
  widgetUrl: 'https://sahajatlas.com',
}

const tracks = tracksFor(VALUES)
const TRACK_IDS = Object.keys(tracks) as TrackId[]

describe('the four platform choices', () => {
  it('offers Custom site first', () => {
    expect(Object.keys(PLATFORM_LABELS)[0]).toBe('custom')
  })

  it('offers exactly the four the ticket names', () => {
    expect(Object.keys(PLATFORM_LABELS).sort()).toEqual(['custom', 'iframe', 'wix', 'wordpress'])
  })

  it('gives WordPress and Wix two sub-tabs each, and the others none', () => {
    expect(TRACKS_BY_PLATFORM.wordpress).toEqual(['wp-selfhosted', 'wp-com'])
    expect(TRACKS_BY_PLATFORM.wix).toEqual(['wix-editor', 'wix-studio'])
    expect(TRACKS_BY_PLATFORM.custom).toHaveLength(1)
    expect(TRACKS_BY_PLATFORM.iframe).toHaveLength(1)
  })

  it('reaches every track from some platform, so none is unreachable', () => {
    const reachable = (Object.keys(TRACKS_BY_PLATFORM) as PlatformId[]).flatMap(
      (platform) => TRACKS_BY_PLATFORM[platform],
    )
    expect(reachable.sort()).toEqual(TRACK_IDS.sort())
  })

  it('tells the volunteer how to recognise their own site, per track', () => {
    for (const id of TRACK_IDS) {
      expect(tracks[id].recognise.length, id).toBeGreaterThan(0)
    }
  })
})

describe('every track', () => {
  it('routes all four check signals to a step it actually has', () => {
    // A failing check that names a step the track does not render is a red light
    // with nowhere to go.
    for (const id of TRACK_IDS) {
      const track = tracks[id]
      const stepIds = new Set(allSteps(track).map((step) => step.id))
      for (const signal of ['noReport', 'head', 'body', 'sitemap'] as const) {
        expect(stepIds, `${id} routes ${signal} nowhere`).toContain(track.checks[signal])
      }
    }
  })

  it('gives every step at least one instruction', () => {
    for (const id of TRACK_IDS) {
      for (const step of allSteps(tracks[id])) {
        expect(step.actions.length, `${id}/${step.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('never repeats a step id, so a check cannot land on two steps at once', () => {
    for (const id of TRACK_IDS) {
      const ids = allSteps(tracks[id]).map((step) => step.id)
      expect(new Set(ids).size, id).toBe(ids.length)
    }
  })

  it('never asks the volunteer to check by hand — the Check button does that', () => {
    for (const id of TRACK_IDS) {
      for (const step of allSteps(tracks[id])) {
        const text = step.actions.map(actionText).join(' ')
        expect(text, `${id}/${step.id}`).not.toMatch(/\b(check|verify|make sure|confirm)\b/i)
      }
    }
  })

  it('puts every value beside the instruction that uses it', () => {
    // A snippet with no sentence before it is a value the volunteer has to place.
    for (const id of TRACK_IDS) {
      for (const step of allSteps(tracks[id])) {
        for (const action of step.actions) {
          if (typeof action === 'string') continue
          expect(action.text.length, `${id}/${step.id}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('puts the noReport step in step 3, where the atlas first appears', () => {
    for (const id of TRACK_IDS) {
      const embed = tracks[id].steps.map((step) => step.id)
      expect(embed, id).toContain(tracks[id].checks.noReport)
    }
  })

  it('never routes a check to a step nothing can observe', () => {
    // Telling a volunteer to redo a step we cannot then re-check leaves the light
    // red forever.
    for (const id of TRACK_IDS) {
      const track = tracks[id]
      const unobservable = new Set(
        allSteps(track)
          .filter((step) => step.unobservable)
          .map((step) => step.id),
      )
      for (const signal of ['noReport', 'head', 'body', 'sitemap'] as const) {
        expect(unobservable, `${id} routes ${signal} to an unobservable step`).not.toContain(
          track.checks[signal],
        )
      }
    }
  })

  it('never leaves a placeholder in a value a volunteer will paste', () => {
    for (const id of TRACK_IDS) {
      for (const snippet of allSteps(tracks[id]).flatMap(snippetsOf)) {
        expect(snippet.value, `${id}/${snippet.label}`).not.toContain('undefined')
        expect(snippet.value, `${id}/${snippet.label}`).not.toContain('${')
      }
    }
  })
})

describe('what each track prefills', () => {
  it('puts the service own key in both WordPress tracks', () => {
    for (const id of ['wp-selfhosted', 'wp-com'] as const) {
      const values = tracks[id].steps.flatMap(snippetsOf).map((s) => s.value)
      expect(values, id).toContain('abc-123')
    }
  })

  it('gives both Wix tracks the router code, the element settings and the text id', () => {
    for (const id of ['wix-editor', 'wix-studio'] as const) {
      const snippets = allSteps(tracks[id]).flatMap(snippetsOf)
      const joined = snippets.map((snippet) => snippet.value).join('\n')
      expect(joined, id).toContain('free_classes_Router')
      expect(joined, id).toContain('https://sahajatlas.com/auto.js?key=abc-123')
      expect(joined, id).toContain(CONTENT_ELEMENT_ID)
    }
  })

  it('gives the Studio track Wix Studio menu names, and the Editor track Dev Mode', () => {
    const studio = JSON.stringify(allSteps(tracks['wix-studio']))
    const editor = JSON.stringify(allSteps(tracks['wix-editor']))
    expect(studio).toContain('Start coding')
    expect(editor).toContain('Dev Mode')
    expect(editor).not.toContain('Start coding')
  })

  it('says plainly that the Studio steps are unverified', () => {
    // A volunteer who hits a menu that is not there must know that was expected.
    expect(tracks['wix-studio'].caveat?.text).toMatch(/unverified|not been|nobody has/i)
  })

  it('says plainly that the iframe track has no search-engine listings', () => {
    expect(`${tracks.iframe.caveat?.title} ${tracks.iframe.caveat?.text}`).toMatch(/search/i)
    expect(tracks.iframe.caveat?.tone).toBe('warning')
  })

  it('names the plan WordPress.com needs, as a condition rather than a step', () => {
    expect(tracks['wp-com'].requires?.text).toContain('Business')
    expect(tracks['wp-com'].steps.map((step) => step.id)).not.toContain('plan')
  })

  it('links the plugin zip at an address that survives the next release', () => {
    // A versioned asset name would go stale the day the plugin ships an update.
    expect(WORDPRESS_PLUGIN_ZIP_URL).toMatch(/\/releases\/latest\/download\/sahaj-atlas\.zip$/)
    for (const id of ['wp-selfhosted', 'wp-com'] as const) {
      const install = tracks[id].steps.find((step) => step.id === 'install-plugin')
      const download = install?.actions.find(
        (action) => typeof action !== 'string' && action.download,
      )
      expect(typeof download === 'object' && download.download?.url, id).toBe(
        WORDPRESS_PLUGIN_ZIP_URL,
      )
    }
  })

  it('tells WordPress how to move the page only when the address is not the default', () => {
    const setUp = (atlasUrl: string) =>
      tracksFor({ ...VALUES, atlasUrl, prefix: atlasUrl.slice(1) })['wp-selfhosted'].steps.find(
        (step) => step.id === 'set-up',
      )
    const moved = setUp('/free-classes')
    expect(JSON.stringify(moved)).toContain('Quick Edit')
    expect(moved && snippetsOf(moved).map((snippet) => snippet.value)).toContain('free-classes')
    expect(JSON.stringify(setUp(WORDPRESS_DEFAULT_PATH))).not.toContain('Quick Edit')
  })

  it('offers both WordPress tracks the shortcode and the block as step 4', () => {
    for (const id of ['wp-selfhosted', 'wp-com'] as const) {
      const more = tracks[id].more
      expect(more?.optional, id).toBe(true)
      expect(JSON.stringify(more?.steps), id).toContain('[sahaj_atlas]')
    }
  })

  it('gets a Wix map working before any code, and leaves the router to step 4', () => {
    for (const id of ['wix-editor', 'wix-studio'] as const) {
      const embed = JSON.stringify(tracks[id].steps)
      expect(embed, id).toContain('https://sahajatlas.com/auto.js?key=abc-123')
      expect(embed, id).not.toContain('Router')
      expect(JSON.stringify(tracks[id].more?.steps), id).toContain('free_classes_Router')
    }
  })

  it('gives a custom site the plain snippet first, and path routing only in step 4', () => {
    expect(JSON.stringify(tracks.custom.steps)).not.toContain('routing=path')
    const more = JSON.stringify(tracks.custom.more?.steps)
    expect(more).toContain('/free-classes/ca/ontario')
    expect(more).toContain('routing=path')
  })

  it('gives a custom site both endpoints, prefilled with its own key', () => {
    const snippets = allSteps(tracks.custom).flatMap(snippetsOf)
    const values = snippets.map((snippet) => snippet.value).join('\n')
    expect(values).toContain('https://cms.sahajatlas.com/api/atlas/seo')
    expect(values).toContain('https://cms.sahajatlas.com/api/atlas/sitemap')
    expect(values).toContain('clients API-Key abc-123')
  })

  it('sends no routing parameter on the iframe track, which has no URLs of its own', () => {
    const snippets = tracks.iframe.steps.flatMap(snippetsOf)
    expect(snippets.map((snippet) => snippet.value).join('')).not.toContain('routing=')
  })
})

describe('stepForCheck', () => {
  const track = tracks['wix-editor']

  it('sends a wrong title to the router-code step', () => {
    expect(stepForCheck(track, 'title')).toBe('paste-routers')
    expect(stepForCheck(track, 'canonical')).toBe('paste-routers')
    expect(stepForCheck(track, 'json-ld')).toBe('paste-routers')
  })

  it('sends missing body text to the text-element step', () => {
    expect(stepForCheck(track, 'body')).toBe('add-text')
  })

  it('sends a missing sitemap entry to the final publish', () => {
    expect(stepForCheck(track, 'sitemap')).toBe('publish-seo')
  })

  it('groups the three head checks into one signal', () => {
    expect(signalFor('title')).toBe('head')
    expect(signalFor('canonical')).toBe('head')
    expect(signalFor('json-ld')).toBe('head')
    expect(signalFor('body')).toBe('body')
    expect(signalFor('sitemap')).toBe('sitemap')
  })
})

describe('hostHints', () => {
  const hints = (
    url: string,
    platform: PlatformId,
    options: { trackId?: TrackId | null; allowed?: string[] } = {},
  ) =>
    hostHints({
      address: readAtlasAddress(url, { wix: platform === 'wix' }),
      platform,
      trackId: options.trackId ?? null,
      allowedDomains: options.allowed ?? [URL.parse(url)?.hostname ?? ''],
    })
  const titles = (list: ReturnType<typeof hints>) => list.map((hint) => hint.title)

  it('says nothing about a declared https domain', () => {
    expect(hints('https://sahajayoga.ca/classes', 'wix')).toEqual([])
    expect(hints('https://sahajayoga.ca/classes', 'custom')).toEqual([])
  })

  it('warns about a domain the service has not declared, which the claim would refuse', () => {
    const list = hints('https://sahajayoga.ca/classes', 'custom', { allowed: ['other.org'] })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ tone: 'warning' })
    expect(list[0].title).toContain('sahajayoga.ca')
    // An empty list declares nothing, so the claim refuses that too.
    expect(hints('https://sahajayoga.ca/classes', 'custom', { allowed: [] })).toHaveLength(1)
  })

  it('accepts a host a wildcard entry covers', () => {
    expect(
      hints('https://www.sahajayoga.ca/classes', 'custom', { allowed: ['*.sahajayoga.ca'] }),
    ).toEqual([])
  })

  it('asks for the https address', () => {
    expect(titles(hints('http://sahajayoga.ca/classes', 'custom'))).toEqual([
      'Use the https address',
    ])
  })

  it('warns a free Wix address only, and offers the iframe track', () => {
    const list = hints('https://sahajayoga-ca.wixsite.com/classes', 'wix')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ tone: 'warning', action: 'switch-to-iframe' })
    expect(list[0].text).toMatch(/Premium/)
    // A custom domain on Wix needs Premium already, so it gets no notice at all.
    expect(hints('https://sahajayoga.ca/classes', 'wix')).toEqual([])
  })

  it('points a WordPress.com address at the WordPress.com track, until it is chosen', () => {
    const url = 'https://sahajayoga.wordpress.com/classes'
    expect(hints(url, 'wordpress', { trackId: 'wp-selfhosted' })[0]).toMatchObject({
      tone: 'info',
      action: 'switch-to-wp-com',
    })
    expect(hints(url, 'wordpress', { trackId: 'wp-com' })).toEqual([])
  })

  it('is not fooled by a lookalike domain', () => {
    expect(hints('https://evil-wixsite.com/classes', 'wix')).toEqual([])
  })
})

describe('readAtlasAddress', () => {
  const read = (input: string, wix = false) => readAtlasAddress(input, { wix })

  it('takes the path out of a whole address, which is what a volunteer copies', () => {
    expect(read('https://www.sahajayoga.org.uk/classes')).toEqual({
      path: '/classes',
      host: 'www.sahajayoga.org.uk',
      secure: true,
      problem: null,
    })
    expect(read('https://sahajayoga.ca/free-classes/?utm_source=x#map').path).toBe('/free-classes')
  })

  it('takes an address with no scheme as https', () => {
    expect(read('sahajayoga.ca/classes')).toMatchObject({
      path: '/classes',
      host: 'sahajayoga.ca',
      secure: true,
    })
    expect(read('http://sahajayoga.ca/classes').secure).toBe(false)
  })

  it('asks for the domain when only a path is given', () => {
    expect(read('/classes').problem).toMatch(/whole address/)
    expect(read('classes').problem).toMatch(/whole address/)
  })

  it('keeps a nested page anywhere but Wix', () => {
    expect(read('https://site.org/about/classes').path).toBe('/about/classes')
    expect(read('https://site.org/about/classes', true).problem).toMatch(/one level/)
  })

  it('keeps a WordPress plain permalink, whose query is the page', () => {
    expect(read('https://site.org/?p=42').path).toBe('/?p=42')
  })

  it('refuses the home page', () => {
    expect(read('https://site.org/').problem).toMatch(/home page/)
  })

  it('holds a Wix address to what a router prefix accepts', () => {
    expect(read('https://site.org/free-classes', true).path).toBe('/free-classes')
    expect(read('https://site.org/Free-Classes', true).problem).toMatch(/lowercase/)
  })

  it('asks for an address when there is none, and refuses what is not one', () => {
    expect(read('  ').problem).toMatch(/Paste/)
    expect(read('ftp://site.org/classes').problem).toMatch(/not a web address/)
  })
})
