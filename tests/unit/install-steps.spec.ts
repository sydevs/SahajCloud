import { describe, expect, it } from 'vitest'

import {
  type Action,
  hostHints,
  type PlatformId,
  PLATFORM_LABELS,
  readAtlasAddress,
  signalFor,
  type Step,
  stepForCheck,
  type Track,
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

/** Every step a track renders, in both of its sections. */
const allSteps = (track: Track): Step[] => [...track.steps, ...(track.more?.steps ?? [])]

/** The words of an action, its bullets included, whatever else it carries. */
const actionText = (action: Action): string =>
  typeof action === 'string' ? action : [action.text, ...(action.items ?? [])].join(' ')

/** Every value a step puts in front of the volunteer to copy. */
const snippetsOf = (step: Step) =>
  step.actions.flatMap((action) =>
    typeof action !== 'string' && action.snippet ? [action.snippet] : [],
  )
const TRACK_IDS = Object.keys(tracks) as TrackId[]

describe('the four platform choices', () => {
  it('offers Custom site first', () => {
    expect(Object.keys(PLATFORM_LABELS)[0]).toBe('custom')
  })

  it('offers the five platforms', () => {
    expect(Object.keys(PLATFORM_LABELS).sort()).toEqual([
      'custom',
      'iframe',
      'squarespace',
      'wix',
      'wordpress',
    ])
  })

  it('gives WordPress two sub-tabs, and the others none', () => {
    expect(TRACKS_BY_PLATFORM.wordpress).toEqual(['wp-selfhosted', 'wp-com'])
    // One Wix track: the Editor and Studio share every panel this install touches.
    expect(TRACKS_BY_PLATFORM.wix).toEqual(['wix'])
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
    for (const id of ['wix'] as const) {
      const snippets = allSteps(tracks[id]).flatMap(snippetsOf)
      const joined = snippets.map((snippet) => snippet.value).join('\n')
      expect(joined, id).toContain('free_classes_Router')
      expect(joined, id).toContain('https://sahajatlas.com/auto.js?key=abc-123')
      expect(joined, id).toContain(CONTENT_ELEMENT_ID)
    }
  })

  it('gives each editor its own bullet for turning on coding', () => {
    const [coding] = tracks.wix.steps[0].actions
    expect(typeof coding === 'object' && coding.items).toEqual([
      expect.stringContaining('In the Wix Editor'),
      expect.stringContaining('In Wix Studio'),
    ])
  })

  it('names both editors where they differ, and only there', () => {
    const steps = JSON.stringify(allSteps(tracks.wix))
    // Turning coding on, the Custom Element menu, and stretching it.
    expect(steps).toContain('Turn on Dev Mode')
    expect(steps).toContain('Start Coding Manually')
    expect(steps).toContain('Embed Code → Custom element')
    expect(steps).toContain('Embed & Social')
    expect(steps).toContain('Add router')
  })

  it('says plainly that the iframe track has no search-engine listings', () => {
    expect(`${tracks.iframe.caveat?.title} ${tracks.iframe.caveat?.text}`).toMatch(/search/i)
  })

  it('names the plan WordPress.com needs, as a condition rather than a step', () => {
    expect(tracks['wp-com'].requires?.title).toBe('Requires WordPress Business plan')
    expect(tracks['wp-com'].requires?.action).toMatchObject({ label: /Iframe only/, to: 'iframe' })
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

  it('sets up the Wix router from the start, so no page is carried across', () => {
    for (const id of ['wix'] as const) {
      const embed = tracks[id].steps.map((step) => step.id)
      expect(embed, id).toEqual(['add-router', 'paste-routers', 'add-element'])
      expect(JSON.stringify(tracks[id].steps), id).toContain('free_classes_Router')
      expect(
        tracks[id].more?.steps.map((step) => step.id),
        id,
      ).toEqual(['add-text'])
      expect(JSON.stringify(allSteps(tracks[id])), id).not.toMatch(/-old\b|Delete the/)
    }
  })

  it('names the router page as Wix creates it, and the code agrees', () => {
    const steps = JSON.stringify(tracks.wix.steps)
    expect(steps).toContain('free-classes-page')
    expect(steps).toContain('const PAGE = \\"free-classes-page\\"')
  })

  it('sends Harmony and Studio Two sites to the iframe track', () => {
    // Told apart by what is missing, since a volunteer does not know the editor's
    // name — and said in the step that asks for Dev Mode.
    const [coding] = tracks.wix.steps
    expect(coding.notice?.title).toMatch(/Dev Mode/)
    expect(coding.notice?.text).toMatch(/Harmony/)
    expect(coding.notice?.action).toMatchObject({ label: /Iframe only/, to: 'iframe' })
    expect(tracks.wix.requires).toBeUndefined()
  })

  it('gives a custom site the plain snippet first, and path routing only in step 4', () => {
    expect(JSON.stringify(tracks.custom.steps)).not.toContain('routing=path')
    const more = JSON.stringify(tracks.custom.more?.steps)
    expect(more).toContain('/free-classes/ca/ontario')
    expect(more).toContain('routing=path')
  })

  it('puts the height choice just above the custom snippet it changes', () => {
    const [first] = tracks.custom.steps[0].actions
    expect(typeof first === 'object' && first.choice).toBe('embed-height')
    expect(typeof first === 'object' && first.snippet?.label).toBe('Embed snippet')
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

describe('Squarespace', () => {
  const track = tracks.squarespace
  const text = JSON.stringify(allSteps(track))

  it('is one track, with no search listings to promise', () => {
    expect(TRACKS_BY_PLATFORM.squarespace).toEqual(['squarespace'])
    expect(track.searchListings).toBe(false)
    expect(track.more).toBeUndefined()
  })

  it('names the plan that runs code, and offers the iframe track below it', () => {
    expect(track.requires?.title).toMatch(/Core/)
    expect(track.requires?.text).toMatch(/Public/)
    expect(track.requires?.action).toMatchObject({ label: /Iframe only/, to: 'iframe' })
  })

  it('uses a Code Block with the plain snippet, since no page answers a sub-path', () => {
    expect(text).toContain('Add Block')
    expect(text).toContain('Mode to HTML')
    const snippets = allSteps(track).flatMap(snippetsOf)
    const embed = snippets.find((snippet) => snippet.label === 'Embed snippet')
    expect(embed?.value).toContain('https://sahajatlas.com/auto.js?key=abc-123')
    expect(embed?.value).not.toContain('routing=')
  })

  it('sets the page slug to the atlas address', () => {
    const slug = allSteps(track)
      .flatMap(snippetsOf)
      .find((snippet) => snippet.label === 'URL slug')
    expect(slug?.value).toBe('free-classes')
  })

  it('warns that the map does not show while logged in, and where to see it', () => {
    expect(text).toMatch(/private window/)
  })

  it('tells a 7.0 site to turn off Ajax loading', () => {
    const notice = track.steps.find((step) => step.id === 'snippet')?.notice
    expect(notice?.text).toMatch(/Enable Ajax loading/)
  })
})

describe('readAtlasAddress — a Squarespace slug', () => {
  it('holds a Squarespace address to one lowercase word, naming Squarespace', () => {
    const read = (input: string) => readAtlasAddress(input, { oneLevel: 'Squarespace' })
    expect(read('https://site.org/classes').path).toBe('/classes')
    expect(read('https://site.org/about/classes').problem).toMatch(/On Squarespace/)
    expect(read('https://site.org/Classes').problem).toMatch(/lowercase/)
  })
})

describe('stepForCheck', () => {
  const track = tracks.wix

  it('sends a wrong title to the router-code step', () => {
    expect(stepForCheck(track, 'title')).toBe('paste-routers')
    expect(stepForCheck(track, 'canonical')).toBe('paste-routers')
    expect(stepForCheck(track, 'json-ld')).toBe('paste-routers')
  })

  it('sends missing body text to the text-element step', () => {
    expect(stepForCheck(track, 'body')).toBe('add-text')
  })

  it('sends a missing sitemap entry to the router code, whose _SiteMap it is', () => {
    expect(stepForCheck(track, 'sitemap')).toBe('paste-routers')
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
    options: { trackId?: TrackId | null; saved?: string | null } = {},
  ) =>
    hostHints({
      address: readAtlasAddress(url, { oneLevel: platform === 'wix' ? 'Wix' : undefined }),
      platform,
      trackId: options.trackId ?? null,
      savedDomain: options.saved === undefined ? URL.parse(url)?.hostname : options.saved,
    })
  const titles = (list: ReturnType<typeof hints>) => list.map((hint) => hint.title)

  it('says nothing about an https address on the saved domain', () => {
    expect(hints('https://sahajayoga.ca/classes', 'wix')).toEqual([])
    expect(hints('https://sahajayoga.ca/classes', 'custom')).toEqual([])
  })

  it('warns that an address on another domain moves the whole service there', () => {
    const list = hints('https://sahajayoga.ca/classes', 'custom', { saved: 'other.org' })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ tone: 'warning' })
    expect(list[0].title).toBe('This moves the service to sahajayoga.ca')
  })

  it('treats the www twin as the same site, and a first address as no move', () => {
    expect(
      hints('https://www.sahajayoga.ca/classes', 'custom', { saved: 'sahajayoga.ca' }),
    ).toEqual([])
    expect(
      hints('https://sahajayoga.ca/classes', 'custom', { saved: 'www.sahajayoga.ca' }),
    ).toEqual([])
    expect(hints('https://sahajayoga.ca/classes', 'custom', { saved: null })).toEqual([])
  })

  it('asks for the https address', () => {
    expect(titles(hints('http://sahajayoga.ca/classes', 'custom'))).toEqual([
      'Use the address that starts with https',
    ])
  })

  it('warns a free Wix address only, and offers the iframe track', () => {
    const list = hints('https://sahajayoga-ca.wixsite.com/classes', 'wix')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ tone: 'warning', action: { to: 'iframe' } })
    expect(list[0].text).toMatch(/Premium/)
    // A custom domain on Wix needs Premium already, so it gets no notice at all.
    expect(hints('https://sahajayoga.ca/classes', 'wix')).toEqual([])
  })

  it('names a free Wix address even while its path is wrong for Wix', () => {
    // A free Wix page is <user>.wixsite.com/<site>/<page>: two segments, which
    // the address check refuses — and that must not hide the real problem.
    const list = hints('https://someone.wixsite.com/sahajayoga/classes', 'wix')
    expect(list.map((hint) => hint.title)).toEqual(['This is a free Wix address'])
  })

  it('points a WordPress.com address at the WordPress.com track, until it is chosen', () => {
    const url = 'https://sahajayoga.wordpress.com/classes'
    const [hint] = hints(url, 'wordpress', { trackId: 'wp-selfhosted' })
    expect(hint).toMatchObject({ action: { label: 'Switch to WordPress.com', to: 'wp-com' } })
    expect(hint.tone).toBeUndefined()
    expect(hints(url, 'wordpress', { trackId: 'wp-com' })).toEqual([])
  })

  it('is not fooled by a lookalike domain', () => {
    expect(hints('https://evil-wixsite.com/classes', 'wix')).toEqual([])
  })
})

describe('readAtlasAddress', () => {
  const read = (input: string, wix = false) =>
    readAtlasAddress(input, { oneLevel: wix ? 'Wix' : undefined })

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
    expect(read('https://site.org/about/classes', true).problem).toMatch(
      /straight after your domain/,
    )
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
    expect(read('ftp://site.org/classes').problem).toMatch(/not look like a web address/)
  })
})
