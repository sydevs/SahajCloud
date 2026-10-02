/**
 * What the import run sends, and when it stops sending it (#828).
 *
 * The run is three awaits in a client component, so what a spec can reach is
 * the two decisions inside the loop: the URL it builds — which it must refuse
 * to build without a locale — and whether another chunk is worth asking for.
 */

import { describe, expect, it } from 'vitest'

import { importStepUrl, refusalMessage } from '@/components/admin/RegionImport/importUrls'
import type { ResolveReport } from '@/components/admin/RegionImport/runPlan'
import {
  resolveProgress,
  resolveSummary,
  resolveVerdict,
} from '@/components/admin/RegionImport/runPlan'

const report = (over: Partial<ResolveReport> = {}): ResolveReport => ({
  done: false,
  duplicates: 0,
  errors: 0,
  pending: 0,
  resolved: 0,
  total: 0,
  ...over,
})

describe('importStepUrl', () => {
  it('addresses the upload by the configured API route, not a typed one', () => {
    expect(importStepUrl({ apiRoute: '/custom-api', locale: 'de', step: 'upload' })).toBe(
      '/custom-api/event-imports/upload?locale=de',
    )
  })

  it('addresses a later step by the batch it staged', () => {
    expect(importStepUrl({ apiRoute: '/api', batchId: 42, locale: 'de', step: 'resolve' })).toBe(
      '/api/event-imports/42/resolve?locale=de',
    )
    expect(importStepUrl({ apiRoute: '/api', batchId: 42, locale: 'de', step: 'propose' })).toBe(
      '/api/event-imports/42/propose?locale=de',
    )
  })

  // The run's half of #701: `mayStageImport` reads the grant for `req.locale`,
  // and `?locale=undefined` resolves to the default locale server-side — a 403
  // for every manager whose roles live elsewhere, with nothing to read.
  it('refuses to build a URL with no locale, rather than sending one without', () => {
    expect(importStepUrl({ apiRoute: '/api', locale: undefined, step: 'upload' })).toBeNull()
    expect(
      importStepUrl({ apiRoute: '/api', batchId: 42, locale: undefined, step: 'resolve' }),
    ).toBeNull()
  })

  it('refuses a later step with no batch to address', () => {
    expect(
      importStepUrl({ apiRoute: '/api', batchId: null, locale: 'de', step: 'resolve' }),
    ).toBeNull()
  })

  it('escapes the locale it carries', () => {
    expect(importStepUrl({ apiRoute: '/api', locale: 'pt-BR&x', step: 'upload' })).toBe(
      '/api/event-imports/upload?locale=pt-BR%26x',
    )
  })
})

describe('refusalMessage', () => {
  it('reads what the endpoint refused with', () => {
    expect(refusalMessage({ errors: [{ message: 'A venue cannot hold them.' }] }, 'fallback')).toBe(
      'A venue cannot hold them.',
    )
  })

  it('joins every reason, so a multi-error refusal is not read as one', () => {
    const body = { errors: [{ message: 'Row 3 is wrong.' }, { message: 'Row 9 is too.' }] }
    expect(refusalMessage(body, 'fallback')).toBe('Row 3 is wrong. Row 9 is too.')
  })

  // A 502 from in front of the app answers HTML, so `response.json()` has
  // already thrown by here — which is exactly when something must still show.
  it('falls back for a body that is not the endpoints’ shape', () => {
    expect(refusalMessage(null, 'fallback')).toBe('fallback')
    expect(refusalMessage('<html>', 'fallback')).toBe('fallback')
    expect(refusalMessage({ errors: 'nope' }, 'fallback')).toBe('fallback')
    expect(refusalMessage({ errors: [{}] }, 'fallback')).toBe('fallback')
  })
})

describe('resolveVerdict', () => {
  it('proposes once the batch has nothing pending', () => {
    expect(resolveVerdict(50, report({ done: true, pending: 0, total: 50 }))).toBe('propose')
  })

  it('asks for another chunk while the count is still falling', () => {
    expect(resolveVerdict(null, report({ pending: 75, total: 100 }))).toBe('resolve')
    expect(resolveVerdict(75, report({ pending: 50, total: 100 }))).toBe('resolve')
  })

  // The loop's only bound. A chunk that writes neither an answer nor a reason
  // would otherwise spend the batch's whole geocoder budget in a tight loop.
  it('stops on a chunk that settled nothing', () => {
    expect(resolveVerdict(50, report({ pending: 50, total: 100 }))).toBe('stalled')
  })

  it('stops on a chunk that went backwards', () => {
    expect(resolveVerdict(50, report({ pending: 51, total: 100 }))).toBe('stalled')
  })

  // The first chunk has nothing to compare against, so the guard must not read
  // its own initial state as a stall.
  it('never stalls on the first chunk', () => {
    expect(resolveVerdict(null, report({ pending: 100, total: 100 }))).toBe('resolve')
  })

  it('proposes a finished batch even where the count did not move', () => {
    expect(resolveVerdict(0, report({ done: true, pending: 0, total: 0 }))).toBe('propose')
  })

  // ⚠ Comparing a count that is not there is `undefined >= undefined` — false on
  // every chunk, so a bound that only compares would spend the batch's whole
  // geocoder budget in a tight loop.
  it('stops on a chunk that reports no pending count at all', () => {
    const blank = { done: false } as unknown as ResolveReport
    expect(resolveVerdict(null, blank)).toBe('stalled')
    expect(resolveVerdict(50, blank)).toBe('stalled')
  })
})

describe('resolveProgress', () => {
  it('counts a row with a reason as settled, the same as a geocoded one', () => {
    expect(resolveProgress(report({ errors: 20, pending: 30, resolved: 50, total: 100 }))).toBe(0.7)
  })

  it('reports an empty file as finished rather than dividing by zero', () => {
    expect(resolveProgress(report({ total: 0 }))).toBe(1)
  })

  it('stays inside 0 and 1 for counts that disagree', () => {
    expect(resolveProgress(report({ pending: 120, total: 100 }))).toBe(0)
  })
})

describe('resolveSummary', () => {
  it('names only the outcomes a batch actually had', () => {
    expect(resolveSummary(report({ pending: 0, resolved: 12, total: 12 }))).toBe(
      '12 rows — 12 ready.',
    )
  })

  it('names the duplicates and the skips where there are any', () => {
    expect(
      resolveSummary(report({ duplicates: 3, errors: 2, pending: 0, resolved: 7, total: 12 })),
    ).toBe('12 rows — 7 ready, 3 already in the Atlas, 2 skipped.')
  })
})
