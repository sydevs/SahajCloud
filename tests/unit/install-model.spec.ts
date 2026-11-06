import type { EmbedMetadata } from '../../src/lib/clients/embedMetadata'
import type { CanonicalVerification, SeoCheckResult } from '../../src/lib/clients/verification'

import { describe, expect, it } from 'vitest'

import {
  buildInstallModel,
  buildMilestones,
  checkOutcome,
  installComplete,
  MILESTONE_STATUS,
  milestonesForRecord,
  reportedMountsFor,
  sectionConfirmed,
} from '../../src/components/admin/InstallGuide/installModel'
import { TRACK_META, tracksFor } from '../../src/components/admin/InstallGuide/steps'
import { EMPTY_VERIFICATION } from '../../src/lib/clients/verification'

/**
 * What the Install tab shows, for every state the record can be in.
 *
 * Two of these states cannot be set up by hand in a browser, which is the whole
 * reason the model is a pure function: a report arriving for the chosen page
 * while the tab is open, and one check failing on a region while it passes on
 * the root.
 *
 * ⚠ **Fixture pre-mortem.** `EmbedMetadata` is keyed on `origin + pathname` with
 * a per-mount record carrying `lastSeen` — verified against
 * `src/lib/clients/embedMetadata.ts`, whose `splitMountKey` counterpart in
 * `verification.ts` is what this model parses the keys with. `CanonicalVerification`
 * is the generated type, so its `seo.results` rows are the real
 * `{ route, check, status, detail? }`.
 */

const TRACK = tracksFor({
  apiKey: 'k',
  prefix: 'free-classes',
  atlasUrl: '/free-classes',
  cmsUrl: 'https://cms.example.org',
  widgetUrl: 'https://sahajatlas.com',
}).wix

const mount = (key: string, lastSeen: string): EmbedMetadata => ({
  [key]: {
    mode: 'inline',
    topLevel: true,
    urlWritable: true,
    paramPersisted: true,
    routing: 'path',
    lastSeen,
  },
})

const verified = (overrides: Partial<CanonicalVerification> = {}): CanonicalVerification => ({
  ...EMPTY_VERIFICATION,
  verified: {
    domain: 'sahajayoga.ca',
    mount: '/free-classes',
    widgetVersion: 3,
    at: '2026-10-01T00:00:00.000Z',
  },
  ...overrides,
})

const seo = (results: SeoCheckResult[]): CanonicalVerification['seo'] => ({
  at: '2026-10-01T00:00:00.000Z',
  results,
})

describe('reportedMountsFor', () => {
  it('matches on the path, because only the site knows its own origin', () => {
    const mounts = reportedMountsFor({
      embedMetadata: mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
      atlasUrl: '/free-classes',
    })
    expect(mounts.map((entry) => entry.host)).toEqual(['sahajayoga.ca'])
  })

  it('ignores a trailing slash, which is the same page', () => {
    const mounts = reportedMountsFor({
      embedMetadata: mount('https://sahajayoga.ca/free-classes/', '2026-10-01T00:00:00.000Z'),
      atlasUrl: '/free-classes',
    })
    expect(mounts).toHaveLength(1)
  })

  it('does not match another page on the same site', () => {
    const mounts = reportedMountsFor({
      embedMetadata: mount('https://sahajayoga.ca/about', '2026-10-01T00:00:00.000Z'),
      atlasUrl: '/free-classes',
    })
    expect(mounts).toEqual([])
  })

  it('keeps a WordPress permalink query, which is the page there', () => {
    const mounts = reportedMountsFor({
      embedMetadata: mount('https://sahajayoga.ca/?p=42', '2026-10-01T00:00:00.000Z'),
      atlasUrl: '/?p=42',
    })
    expect(mounts).toHaveLength(1)
  })

  it('puts the most recently seen host first, so a staging copy does not win', () => {
    const mounts = reportedMountsFor({
      embedMetadata: {
        ...mount('https://staging.sahajayoga.ca/free-classes', '2026-09-01T00:00:00.000Z'),
        ...mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
      },
      atlasUrl: '/free-classes',
    })
    expect(mounts.map((entry) => entry.host)).toEqual(['sahajayoga.ca', 'staging.sahajayoga.ca'])
  })

  it('answers nothing for a service that has reported nothing', () => {
    expect(reportedMountsFor({ embedMetadata: null, atlasUrl: '/free-classes' })).toEqual([])
    expect(reportedMountsFor({ embedMetadata: {}, atlasUrl: '/free-classes' })).toEqual([])
  })
})

describe('buildInstallModel — the stage', () => {
  const build = (args: {
    embedMetadata?: EmbedMetadata | null
    verification?: CanonicalVerification | null
    busy?: boolean
  }) =>
    buildInstallModel({
      atlasUrl: '/free-classes',
      track: TRACK,
      embedMetadata: args.embedMetadata ?? null,
      verification: args.verification ?? null,
      busy: args.busy,
    })

  it('waits while nothing has reported itself', () => {
    expect(build({}).stage).toBe('waiting')
  })

  it('says the atlas has been seen the moment a report arrives', () => {
    const model = build({
      embedMetadata: mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
    })
    expect(model.stage).toBe('seen')
    expect(model.candidate?.key).toBe('https://sahajayoga.ca/free-classes')
  })

  it('is verified once the CMS has confirmed it and no check failed', () => {
    expect(
      build({
        embedMetadata: mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
        verification: verified({ seo: seo([{ route: '/', check: 'title', status: 'pass' }]) }),
      }).stage,
    ).toBe('verified')
  })

  it('warns when it is live and a search engine cannot read part of it', () => {
    // The state the whole tab exists to make visible.
    const model = build({
      embedMetadata: mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
      verification: verified({ seo: seo([{ route: '/', check: 'title', status: 'fail' }]) }),
    })
    expect(model.stage).toBe('warnings')
    expect(model.failures).toHaveLength(1)
  })

  it('reports a confirmed failure as failed, not as still waiting', () => {
    expect(
      build({
        embedMetadata: mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z'),
        verification: {
          ...EMPTY_VERIFICATION,
          attempts: [{ at: '2026-10-01T00:00:00.000Z', status: 'failed', reason: 'marker-absent' }],
        },
      }).stage,
    ).toBe('failed')
  })

  it('says it is checking while it is checking', () => {
    expect(build({ busy: true }).stage).toBe('verifying')
  })
})

describe('buildInstallModel — what each step says', () => {
  const build = (verification: CanonicalVerification | null, reported = true) =>
    buildInstallModel({
      atlasUrl: '/free-classes',
      track: TRACK,
      embedMetadata: reported
        ? mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')
        : null,
      verification,
    })

  it('leaves the report step unresolved until something reports', () => {
    const model = build(null, false)
    expect(model.stepStatus[TRACK.checks.noReport]?.state).toBe('unknown')
  })

  it('gives an unresolved step no message, so none can join a failure list', () => {
    expect(build(null, false).stepStatus[TRACK.checks.noReport]?.messages).toEqual([])
  })

  it('confirms the report step as soon as something does', () => {
    expect(build(null).stepStatus[TRACK.checks.noReport]?.state).toBe('pass')
  })

  it('marks the router-code step for a wrong title, and names both values', () => {
    const model = build(
      verified({
        seo: seo([
          {
            route: '/',
            check: 'title',
            status: 'fail',
            detail: 'Expected “A”, the page says “B”.',
          },
        ]),
      }),
    )
    const step = model.stepStatus[TRACK.checks.head]
    expect(step?.state).toBe('fail')
    expect(step?.messages[0]).toContain('Expected “A”')
    expect(step?.messages[0]).toContain('your atlas page')
  })

  it('names the region page rather than “your atlas page” for a region failure', () => {
    const model = build(verified({ seo: seo([{ route: '/ca', check: 'body', status: 'fail' }]) }))
    expect(model.stepStatus[TRACK.checks.body]?.messages[0]).toContain('/ca')
  })

  it('lets a failure on one page outrank a pass on another, for the same step', () => {
    // Two pages share one step, and a step broken anywhere is broken. The
    // failure comes FIRST on purpose: last-one-wins passes this case by
    // accident when the fail happens to be last.
    const model = build(
      verified({
        seo: seo([
          { route: '/', check: 'title', status: 'fail' },
          { route: '/ca', check: 'title', status: 'pass' },
        ]),
      }),
    )
    expect(model.stepStatus[TRACK.checks.head]?.state).toBe('fail')
  })

  it('shows a skipped check as nothing at all, never as a problem', () => {
    const model = build(
      verified({
        seo: seo([
          { route: '/', check: 'sitemap', status: 'skipped' },
          { route: '/', check: 'body', status: 'skipped' },
        ]),
      }),
    )
    // The text step has nothing after it to imply it, so the skip alone leaves it blank.
    expect(model.stepStatus[TRACK.checks.body]).toBeUndefined()
    // The router-code step is implied by the detected map after it, never failed by the skip.
    expect(model.stepStatus[TRACK.checks.sitemap]).toEqual({ state: 'done', messages: [] })
    expect(model.failures).toEqual([])
  })
})

describe('buildInstallModel — before the volunteer has chosen', () => {
  const embedMetadata = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')

  it('still finds the report with no track, and marks no step', () => {
    const model = buildInstallModel({
      atlasUrl: '/free-classes',
      track: null,
      embedMetadata,
      verification: verified({ seo: seo([{ route: '/', check: 'title', status: 'fail' }]) }),
    })
    expect(model.candidate?.key).toBe('https://sahajayoga.ca/free-classes')
    expect(model.stage).toBe('warnings')
    expect(model.stepStatus).toEqual({})
  })

  it('matches nothing while the address has a problem', () => {
    // A null address must not fall back to matching the site root.
    expect(reportedMountsFor({ embedMetadata, atlasUrl: null })).toEqual([])
    expect(
      buildInstallModel({ atlasUrl: null, track: TRACK, embedMetadata, verification: null })
        .candidate,
    ).toBeNull()
  })
})

describe('buildMilestones', () => {
  const embedMetadata = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')
  const milestones = (args: {
    verification?: CanonicalVerification | null
    reported?: boolean
    owned?: boolean
    /** A worldwide map: no region. */
    worldwide?: boolean
    trackId?: 'iframe' | 'wix' | 'squarespace' | null
  }) => {
    const verification = args.verification ?? null
    const model = buildInstallModel({
      atlasUrl: '/free-classes',
      track: TRACK,
      embedMetadata: args.reported === false ? null : embedMetadata,
      verification,
    })
    return buildMilestones({
      model,
      verification,
      owned: args.owned ?? false,
      track: args.trackId ? TRACK_META[args.trackId] : null,
      regionName: args.worldwide ? null : 'Ontario',
    })
  }
  const states = (list: ReturnType<typeof milestones>) =>
    Object.fromEntries(list.map((milestone) => [milestone.id, milestone.state]))

  it('starts with everything still to come', () => {
    expect(states(milestones({ reported: false }))).toEqual({
      seen: 'todo',
      confirmed: 'todo',
      region: 'todo',
      routing: 'todo',
      search: 'todo',
    })
  })

  it('names where the atlas was found', () => {
    const [seen] = milestones({})
    expect(seen).toMatchObject({
      state: 'done',
      status: 'Done',
      note: 'sahajayoga.ca/free-classes',
    })
  })

  it('words every status from one vocabulary, so the column reads the same way', () => {
    const vocabulary = new Set(Object.values(MILESTONE_STATUS))
    for (const list of [
      milestones({ reported: false }),
      milestones({ worldwide: true }),
      milestones({ trackId: 'iframe' }),
    ]) {
      for (const milestone of list) {
        expect(vocabulary).toContain(
          milestone.state === 'na' ? MILESTONE_STATUS.na : milestone.status,
        )
      }
    }
  })

  it('finishes every row for a clean install', () => {
    const list = milestones({
      owned: true,
      verification: verified({
        routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
        seo: seo([{ route: '/', check: 'title', status: 'pass' }]),
      }),
    })
    expect(list.every((milestone) => milestone.state === 'done')).toBe(true)
  })

  it('names the region, and the site its links lead to', () => {
    const byId = (list: ReturnType<typeof milestones>) =>
      Object.fromEntries(list.map((milestone) => [milestone.id, milestone.note]))
    expect(byId(milestones({})).region).toBe('Atlas links for Ontario will lead to sahajayoga.ca')
    const done = byId(
      milestones({
        owned: true,
        verification: verified({
          routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
          seo: seo([{ route: '/', check: 'title', status: 'pass' }]),
        }),
      }),
    )
    expect(done).toMatchObject({
      region: 'Atlas links for Ontario lead to sahajayoga.ca',
      routing: 'Each class has its own shareable link on sahajayoga.ca',
      search: 'Google can read information about your classes on sahajayoga.ca',
    })
  })

  it('counts search problems, and marks a worldwide map as owning no region', () => {
    const list = milestones({
      worldwide: true,
      verification: verified({
        seo: seo([
          { route: '/', check: 'title', status: 'fail' },
          { route: '/', check: 'body', status: 'fail' },
        ]),
      }),
    })
    const byId = Object.fromEntries(list.map((milestone) => [milestone.id, milestone]))
    expect(byId.search).toMatchObject({ state: 'failed', status: 'Needs fixing' })
    expect(byId.search.note).toMatch(/^2 problems/)
    expect(byId.region).toMatchObject({ state: 'na', status: 'Not available for a worldwide map' })
  })

  it('names the regions a worldwide fallback owner is the home for', () => {
    const region = milestones({ worldwide: true, owned: true, verification: verified() }).find(
      (milestone) => milestone.id === 'region',
    )
    expect(region).toMatchObject({
      state: 'done',
      note: 'Atlas links for regions without a site of their own lead to sahajayoga.ca',
    })
  })

  it('gives a page with no class addresses no region to own, whatever its region', () => {
    const region = milestones({ trackId: 'iframe' }).find((milestone) => milestone.id === 'region')
    expect(region).toMatchObject({ state: 'na', status: 'Not available for Iframe only' })
  })

  it('counts ?atlas= links as class addresses', () => {
    const query = milestones({
      verification: verified({
        routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'query', failedAttempts: 1 },
      }),
    })
    expect(query.find((m) => m.id === 'routing')).toMatchObject({
      state: 'done',
      note: 'Each class has its own shareable link on sahajayoga.ca',
    })
  })

  it('gives Squarespace class addresses but no search listings', () => {
    const list = milestones({
      trackId: 'squarespace',
      verification: verified({
        routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'query', failedAttempts: 1 },
      }),
    })
    const byId = Object.fromEntries(list.map((m) => [m.id, m.state]))
    expect(byId).toMatchObject({ routing: 'done', search: 'na' })
    expect(list.find((m) => m.id === 'search')?.status).toBe('Not available for Squarespace')
  })

  it('shows an iframe the two rows it can never finish, as not available', () => {
    const states = Object.fromEntries(
      milestones({ trackId: 'iframe' }).map((milestone) => [milestone.id, milestone.state]),
    )
    expect(states).toMatchObject({ routing: 'na', search: 'na' })
    expect(states.seen).toBe('done')
  })

  it('names the kind of site in a Not available status', () => {
    const list = milestones({ trackId: 'iframe' }).filter((milestone) => milestone.state === 'na')
    // Region, class addresses and search listings: an iframe can have none of them.
    expect(list.map((milestone) => milestone.status)).toEqual([
      'Not available for Iframe only',
      'Not available for Iframe only',
      'Not available for Iframe only',
    ])
  })
})

describe('checkOutcome', () => {
  const verified = (seo: SeoCheckResult[] = []) =>
    ({ status: 'verified', message: 'Verified.', seo }) as const

  it('says nothing was found when the widget has not reported from this address', () => {
    const banner = checkOutcome({ path: '/classes', reported: false, claim: null, verify: null })
    expect(banner).toMatchObject({ type: 'warning', title: 'Not found yet' })
    expect(banner.text).toContain('/classes')
  })

  it('celebrates a clean pass', () => {
    expect(
      checkOutcome({
        path: '/classes',
        reported: true,
        claim: { status: 'claimed', message: '' },
        verify: verified([{ route: '/', check: 'title', status: 'pass' }]),
      }),
    ).toMatchObject({ type: 'success' })
  })

  it('counts search problems on a live install', () => {
    const banner = checkOutcome({
      path: '/classes',
      reported: true,
      claim: { status: 'already', message: '' },
      verify: verified([
        { route: '/', check: 'title', status: 'fail' },
        { route: '/', check: 'body', status: 'skipped' },
      ]),
    })
    expect(banner).toMatchObject({ type: 'warning', title: 'Live, with 1 search problem' })
  })

  it('leads with the claim when there was nothing to verify', () => {
    const banner = checkOutcome({
      path: '/classes',
      reported: true,
      claim: { status: 'taken', message: 'Another site already owns it.' },
      verify: null,
    })
    expect(banner).toMatchObject({ type: 'warning', title: 'Another site already has this region' })
    expect(banner.text).toBe('Another site already owns it.')
  })

  it('raises no warning for a claim that has nothing to fix', () => {
    for (const status of ['worldwide', 'no-class-addresses'] as const) {
      expect(
        checkOutcome({
          path: '/classes',
          reported: true,
          claim: { status, message: 'Nothing to own.' },
          verify: verified([{ route: '/', check: 'title', status: 'pass' }]),
        }),
      ).toMatchObject({ type: 'success' })
    }
  })

  it('reports a failed verification as an error, in the endpoint own words', () => {
    expect(
      checkOutcome({
        path: '/classes',
        reported: true,
        claim: { status: 'already', message: '' },
        verify: { status: 'failed', message: 'That page could not be reached.', seo: [] },
      }),
    ).toMatchObject({ type: 'error', text: 'That page could not be reached.' })
  })

  it('admits it could not reach the CMS at all', () => {
    expect(checkOutcome({ path: '/classes', reported: true, claim: null, verify: null }).type).toBe(
      'error',
    )
  })
})

describe('buildInstallModel — steps a later confirmation implies', () => {
  const embedMetadata = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')
  const status = (verification: CanonicalVerification | null, reported = true) =>
    buildInstallModel({
      atlasUrl: '/free-classes',
      track: TRACK,
      embedMetadata: reported ? embedMetadata : null,
      verification,
    }).stepStatus

  it('marks the router steps done once the map on the router page is detected', () => {
    // The map can only show on the router page once the router and its code work.
    expect(status(null)['add-router']?.state).toBe('done')
    expect(status(null)['paste-routers']?.state).toBe('done')
    expect(status(null, false)['add-router']).toBeUndefined()
  })

  it('implies nothing past the last confirmed step', () => {
    const steps = status(verified({ seo: seo([{ route: '/', check: 'title', status: 'pass' }]) }))
    expect(steps['paste-routers']?.state).toBe('pass')
    expect(steps['add-text']).toBeUndefined()
  })

  it('never paints over a failure', () => {
    const steps = status(verified({ seo: seo([{ route: '/', check: 'title', status: 'fail' }]) }))
    expect(steps['paste-routers']?.state).toBe('fail')
    expect(steps['add-router']?.state).toBe('done')
  })
})

describe('buildInstallModel — class addresses on a custom site', () => {
  const CUSTOM = tracksFor({
    apiKey: 'k',
    prefix: 'free-classes',
    atlasUrl: '/free-classes',
    cmsUrl: 'https://cms.example.org',
    widgetUrl: 'https://sahajatlas.com',
  }).custom
  const KEY = 'https://sahajayoga.ca/free-classes'
  const report = (routing: 'path' | 'query'): EmbedMetadata => ({
    [KEY]: { ...mount(KEY, '2026-10-01T00:00:00.000Z')[KEY], routing },
  })
  const probe = (verdict: 'path' | 'query', at = '2026-10-02T00:00:00.000Z') =>
    verified({ routingProbe: { at, verdict, failedAttempts: verdict === 'path' ? 0 : 1 } })
  const catchAll = (embedMetadata: EmbedMetadata, verification: CanonicalVerification) =>
    buildInstallModel({ atlasUrl: '/free-classes', track: CUSTOM, embedMetadata, verification })
      .stepStatus['catch-all']

  it('confirms the step once the snippet asks for paths and the server answers them', () => {
    expect(catchAll(report('path'), probe('path'))?.state).toBe('pass')
  })

  it('fails it when the snippet asks for paths and a later probe found none', () => {
    const status = catchAll(report('path'), probe('query'))
    expect(status?.state).toBe('fail')
    expect(status?.messages[0]).toContain('/free-classes/ca/ontario')
  })

  it('waits on a probe older than the report, which predates the server change', () => {
    expect(catchAll(report('path'), probe('query', '2026-09-30T00:00:00.000Z'))).toBeUndefined()
  })

  it('waits while the snippet still asks for ?atlas= links, whatever the server does', () => {
    expect(catchAll(report('query'), probe('path'))).toBeUndefined()
  })

  it('infers nothing in the follow-on section, whose steps have no order', () => {
    const status = buildInstallModel({
      atlasUrl: '/free-classes',
      track: CUSTOM,
      embedMetadata: report('query'),
      verification: verified({ seo: seo([{ route: '/', check: 'title', status: 'pass' }]) }),
    }).stepStatus
    expect(status['render-seo']?.state).toBe('pass')
    expect(status['catch-all']).toBeUndefined()
  })
})

describe('a track with no search listings', () => {
  const iframe = tracksFor({
    apiKey: 'k',
    prefix: 'free-classes',
    atlasUrl: '/free-classes',
    cmsUrl: 'https://cms.example.org',
    widgetUrl: 'https://sahajatlas.com',
  }).iframe
  const embedMetadata = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')
  const failing = verified({ seo: seo([{ route: '/', check: 'title', status: 'fail' }]) })

  it('ignores the search checks the CMS ran anyway, rather than calling it broken', () => {
    const model = buildInstallModel({
      atlasUrl: '/free-classes',
      track: iframe,
      embedMetadata,
      verification: failing,
    })
    expect(model.stage).toBe('verified')
    expect(model.failures).toEqual([])
    expect(model.stepStatus.snippet?.state).toBe('pass')
  })

  it('reports a clean check, not search problems', () => {
    const banner = checkOutcome({
      path: '/free-classes',
      reported: true,
      claim: { status: 'already', message: '' },
      verify: { status: 'verified', message: '', seo: failing.seo?.results ?? [] },
      searchListings: false,
    })
    expect(banner).toMatchObject({ type: 'success', text: 'The atlas is live on your site.' })
  })
})

describe('sectionConfirmed — when a section stops offering Check my site', () => {
  const embedMetadata = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')
  const model = (verification: CanonicalVerification | null, reported = true) =>
    buildInstallModel({
      atlasUrl: '/free-classes',
      track: TRACK,
      embedMetadata: reported ? embedMetadata : null,
      verification,
    })
  const step4 = TRACK.more?.steps ?? []

  it('keeps step 3 checkable until the map is detected', () => {
    expect(sectionConfirmed(TRACK.steps, model(null, false).stepStatus)).toBe(false)
    expect(sectionConfirmed(TRACK.steps, model(null).stepStatus)).toBe(true)
  })

  it('keeps step 3 checkable while a step in it needs redoing', () => {
    const failing = model(verified({ seo: seo([{ route: '/', check: 'title', status: 'fail' }]) }))
    expect(sectionConfirmed(TRACK.steps, failing.stepStatus)).toBe(false)
  })

  it('offers step 4 its own check until its text is confirmed', () => {
    const before = model(verified({ seo: seo([{ route: '/', check: 'title', status: 'pass' }]) }))
    expect(sectionConfirmed(TRACK.steps, before.stepStatus)).toBe(true)
    expect(sectionConfirmed(step4, before.stepStatus)).toBe(false)
    const after = model(
      verified({
        seo: seo([
          { route: '/', check: 'title', status: 'pass' },
          { route: '/', check: 'body', status: 'pass' },
        ]),
      }),
    )
    expect(sectionConfirmed(step4, after.stepStatus)).toBe(true)
  })
})

describe('milestonesForRecord — progress off the stored record', () => {
  const site = { domain: 'sahajayoga.ca', page: '/free-classes', track: 'custom' as const }
  const reported = mount('https://sahajayoga.ca/free-classes', '2026-10-01T00:00:00.000Z')

  it('counts nothing done for a service with no page yet', () => {
    const list = milestonesForRecord({
      site: null,
      embedMetadata: null,
      verification: null,
      owned: false,
      regionName: 'Ontario',
    })
    expect(list.find((m) => m.id === 'seen')?.state).toBe('todo')
    expect(installComplete(list)).toBe(false)
  })

  it('is complete when every row it can reach is done', () => {
    const list = milestonesForRecord({
      site,
      embedMetadata: reported,
      verification: verified({
        routingProbe: { at: '2026-10-02T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
        seo: seo([{ route: '/', check: 'title', status: 'pass' }]),
      }),
      owned: true,
      regionName: 'Ontario',
    })
    expect(installComplete(list)).toBe(true)
  })

  it('reads a reported page on another domain as not this site', () => {
    const list = milestonesForRecord({
      site,
      embedMetadata: mount('https://elsewhere.example/free-classes', '2026-10-01T00:00:00.000Z'),
      verification: null,
      owned: false,
      regionName: 'Ontario',
    })
    expect(list.find((m) => m.id === 'seen')?.state).toBe('todo')
  })
})
