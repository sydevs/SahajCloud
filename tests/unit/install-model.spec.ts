import type { EmbedMetadata } from '../../src/lib/clients/embedMetadata'
import type { CanonicalVerification, SeoCheckResult } from '../../src/lib/clients/verification'

import { describe, expect, it } from 'vitest'

import {
  buildInstallModel,
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
})['wix-editor']

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
      verified({ seo: seo([{ route: '/', check: 'sitemap', status: 'skipped' }]) }),
    )
    expect(model.stepStatus[TRACK.checks.sitemap]).toBeUndefined()
    expect(model.failures).toEqual([])
  })
})
