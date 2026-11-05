import type { EmbedMetadata } from '../../src/lib/clients/embedMetadata'
import type { CanonicalVerification, SeoCheckResult } from '../../src/lib/clients/verification'

import { describe, expect, it } from 'vitest'

import {
  buildInstallModel,
  buildMilestones,
  checkOutcome,
  MILESTONE_STATUS,
  reportedMountsFor,
} from '../../src/components/admin/InstallGuide/installModel'
import { tracksFor } from '../../src/components/admin/InstallGuide/steps'
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
    expect(step?.messages[0]).toContain('the main page')
  })

  it('names the region page rather than “the main page” for a region failure', () => {
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
    canonicalEmbed?: string | null
    hasRegion?: boolean
    trackId?: 'iframe' | 'wix' | null
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
      canonicalEmbed: args.canonicalEmbed ?? null,
      hasRegion: args.hasRegion ?? true,
      searchListings: args.trackId !== 'iframe',
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
      milestones({ hasRegion: false }),
      milestones({ trackId: 'iframe' }),
    ]) {
      for (const milestone of list) expect(vocabulary).toContain(milestone.status)
    }
  })

  it('finishes every row for a clean install', () => {
    const list = milestones({
      canonicalEmbed: 'https://sahajayoga.ca/free-classes',
      verification: verified({
        routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
        seo: seo([{ route: '/', check: 'title', status: 'pass' }]),
      }),
    })
    expect(list.every((milestone) => milestone.state === 'done')).toBe(true)
  })

  it('counts search problems, and flags a service with no region', () => {
    const list = milestones({
      hasRegion: false,
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
    expect(byId.region).toMatchObject({ state: 'warning', status: 'Needs action' })
  })

  it('shows an iframe the two rows it can never finish, as not available', () => {
    const states = Object.fromEntries(
      milestones({ trackId: 'iframe' }).map((milestone) => [milestone.id, milestone.state]),
    )
    expect(states).toMatchObject({ routing: 'na', search: 'na' })
    expect(states.seen).toBe('done')
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
      claim: { status: 'needs-region', message: 'Set a region on this service first.' },
      verify: null,
    })
    expect(banner).toMatchObject({ type: 'warning', title: 'Set a region first' })
    expect(banner.text).toBe('Set a region on this service first.')
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
