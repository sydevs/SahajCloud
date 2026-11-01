import { describe, expect, it } from 'vitest'

import {
  atlasUrlProblem,
  hostHints,
  type PlatformId,
  PLATFORM_LABELS,
  signalFor,
  stepForCheck,
  type TrackId,
  TRACKS_BY_PLATFORM,
  tracksFor,
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
      const stepIds = new Set(track.steps.map((step) => step.id))
      for (const signal of ['noReport', 'head', 'body', 'sitemap'] as const) {
        expect(stepIds, `${id} routes ${signal} nowhere`).toContain(track.checks[signal])
      }
    }
  })

  it('gives every step at least one instruction', () => {
    for (const id of TRACK_IDS) {
      for (const step of tracks[id].steps) {
        expect(step.actions.length, `${id}/${step.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('never routes a check to a step nothing can observe', () => {
    // Telling a volunteer to redo a step we cannot then re-check leaves the light
    // red forever.
    for (const id of TRACK_IDS) {
      const track = tracks[id]
      const unobservable = new Set(
        track.steps.filter((step) => step.unobservable).map((step) => step.id),
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
      for (const snippet of tracks[id].steps.flatMap((step) => step.snippets ?? [])) {
        expect(snippet.value, `${id}/${snippet.label}`).not.toContain('undefined')
        expect(snippet.value, `${id}/${snippet.label}`).not.toContain('${')
      }
    }
  })
})

describe('what each track prefills', () => {
  it('puts the service own key in both WordPress tracks', () => {
    for (const id of ['wp-selfhosted', 'wp-com'] as const) {
      const values = tracks[id].steps.flatMap((step) => step.snippets ?? []).map((s) => s.value)
      expect(values, id).toContain('abc-123')
    }
  })

  it('gives both Wix tracks the router code, the element settings and the text id', () => {
    for (const id of ['wix-editor', 'wix-studio'] as const) {
      const snippets = tracks[id].steps.flatMap((step) => step.snippets ?? [])
      const joined = snippets.map((snippet) => snippet.value).join('\n')
      expect(joined, id).toContain('free_classes_Router')
      expect(joined, id).toContain('https://sahajatlas.com/auto.js?key=abc-123')
      expect(joined, id).toContain(CONTENT_ELEMENT_ID)
    }
  })

  it('gives the Studio track Wix Studio menu names, and the Editor track Dev Mode', () => {
    const studio = JSON.stringify(tracks['wix-studio'].steps)
    const editor = JSON.stringify(tracks['wix-editor'].steps)
    expect(studio).toContain('Start coding')
    expect(editor).toContain('Dev Mode')
    expect(editor).not.toContain('Start coding')
  })

  it('says plainly that the Studio steps are unverified', () => {
    // A volunteer who hits a menu that is not there must know that was expected.
    expect(tracks['wix-studio'].caveat).toMatch(/unverified|not been|nobody has/i)
  })

  it('says plainly that the iframe track has no search-engine listings', () => {
    expect(tracks.iframe.caveat).toMatch(/search/i)
  })

  it('says plainly that WordPress.com is unconfirmed, and names the plan', () => {
    expect(tracks['wp-com'].caveat).toMatch(/confirmed/i)
    expect(JSON.stringify(tracks['wp-com'].steps)).toContain('Business')
  })

  it('tells a custom site it must serve every address under the atlas page', () => {
    const custom = JSON.stringify(tracks.custom.steps)
    expect(custom).toContain('/free-classes/ca/ontario')
    expect(custom).toContain('routing=path')
  })

  it('offers a custom site the endpoint as a prefilled curl', () => {
    const snippets = tracks.custom.steps.flatMap((step) => step.snippets ?? [])
    const curl = snippets.find((snippet) => snippet.value.startsWith('curl'))
    expect(curl?.value).toContain('abc-123')
    expect(curl?.value).toContain('https://cms.sahajatlas.com/api/atlas/seo')
  })

  it('sends no routing parameter on the iframe track, which has no URLs of its own', () => {
    const snippets = tracks.iframe.steps.flatMap((step) => step.snippets ?? [])
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

  it('sends a missing sitemap entry to the publish step', () => {
    expect(stepForCheck(track, 'sitemap')).toBe('publish')
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
  it('warns a free Wix address and offers the iframe track', () => {
    const hints = hostHints({ host: 'sahajayoga-ca.wixsite.com', platform: 'wix' })
    expect(hints).toHaveLength(1)
    expect(hints[0].message).toMatch(/Premium/)
    expect(hints[0].offerIframe).toBe(true)
  })

  it('warns a wordpress.com address about the plan, without offering the iframe', () => {
    const hints = hostHints({ host: 'sahajayoga.wordpress.com', platform: 'wordpress' })
    expect(hints).toHaveLength(1)
    expect(hints[0].message).toMatch(/Business/)
    expect(hints[0].offerIframe).toBe(false)
  })

  it('does not warn a real domain, or a host it has nothing to say about', () => {
    expect(hostHints({ host: 'sahajayoga.ca', platform: 'wix' })).toEqual([])
    expect(hostHints({ host: 'sahajayoga.wordpress.com', platform: 'wix' })).toEqual([])
    expect(hostHints({ host: null, platform: 'wix' })).toEqual([])
  })

  it('is not fooled by a lookalike domain', () => {
    expect(hostHints({ host: 'evil-wixsite.com', platform: 'wix' })).toEqual([])
  })
})

describe('atlasUrlProblem', () => {
  it('accepts a one-level lowercase address', () => {
    expect(atlasUrlProblem('/classes')).toBeNull()
    expect(atlasUrlProblem('/free-classes')).toBeNull()
  })

  it('refuses the home page, which a Wix router cannot be', () => {
    expect(atlasUrlProblem('/')).toMatch(/own address/)
  })

  it('refuses a nested address, which a Wix router cannot be either', () => {
    expect(atlasUrlProblem('/about/classes')).toMatch(/one level/)
  })

  it('refuses what Wix would not accept as a page slug', () => {
    expect(atlasUrlProblem('/Free Classes')).toMatch(/lowercase/)
  })

  it('names the slash, which is the mistake a volunteer actually makes', () => {
    expect(atlasUrlProblem('classes')).toMatch(/slash/)
    expect(atlasUrlProblem('')).toMatch(/Enter/)
  })
})
