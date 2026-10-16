import { describe, expect, it } from 'vitest'

import { DEFAULT_WRITE_GUARD_POLICIES } from '@/plugins/writeGuard/policies'

/**
 * The policy map IS the public write surface, and nothing pinned it until #629.
 *
 * That matters more than a normal config test, because the map fails *open* in
 * one specific direction: an absent knob means "do not run that check". So a
 * dropped `turnstile: true` does not break a build, fail a type-check or throw
 * at boot — it silently reopens a captcha-free public write path, and every
 * other test in the suite keeps passing. The integration lane catches it only
 * for paths that have a spec exercising a refusal.
 */
describe('DEFAULT_WRITE_GUARD_POLICIES', () => {
  /**
   * Every collection a client may create through. One intake since #800, and
   * `users` is not on it: a client never creates one directly —
   * `prepareUserSubmission` upserts it on the client's own `req`.
   */
  const PUBLIC_CREATE_PATHS = ['user-submissions'] as const

  it.each(PUBLIC_CREATE_PATHS)('requires Turnstile on %s create', (slug) => {
    expect(DEFAULT_WRITE_GUARD_POLICIES[slug]?.create?.turnstile).toBe(true)
  })

  it('checks the sender address on the unified intake, for every type', () => {
    // One policy, not four: the guard runs beforeValidate on data whose `type`
    // a forged body chooses, so a check relaxed for one type is reachable by
    // claiming to be that type.
    expect(DEFAULT_WRITE_GUARD_POLICIES['user-submissions']?.create?.emailFields).toContain(
      'senderEmail',
    )
  })

  it('leaves `submissionData` out of the unified intake\'s URL scan', () => {
    // Deliberate, and the one thing here that reads like an omission. The
    // captcha stops bulk automation; the URL scan is what stops a human
    // spammer typing a link into a free-text answer, and neither replaces the
    // other. But a scan of this column — by path or derived — flattens the
    // whole `[{field, value}]` array, including the crash-report context
    // (`error`, `hostUrl`) that is exempt on purpose, because a bug report
    // names the page it happened on. `prepareUserSubmission` scans the pairs
    // selectively instead, because it knows each pair's key. Scanning it here
    // would refuse every issue report.
    const policy = DEFAULT_WRITE_GUARD_POLICIES['user-submissions']?.create

    expect(policy?.urlScanFields ?? []).not.toContain('submissionData')
    expect(policy?.derivedScan?.path).not.toBe('submissionData')
  })

  /**
   * ⚠ The rule this one exists for (#948). `proposed` named four `proposed.*`
   * paths here while the screening job walked the whole column and derived the
   * exemption from the Events config, so a proposable free-text Events column
   * outside those four — `contactPhone` was one — was scanned by neither. A
   * path list is what makes that possible, so the absence of one is the fix.
   */
  it('derives the proposal scan from the Events config, naming no path', () => {
    const policy = DEFAULT_WRITE_GUARD_POLICIES['user-submissions']?.create

    expect(policy?.derivedScan).toEqual({ path: 'proposed', collection: 'events' })

    // Every list the guard reads, so a path cannot come back through the other
    // one — `proposed.contactEmail` was an `emailFields` entry.
    const listed = [...(policy?.urlScanFields ?? []), ...(policy?.emailFields ?? [])]
    expect(listed.filter((path) => path.startsWith('proposed'))).toEqual([])
  })

  it('leaves users create without Turnstile, because no client posts to it directly', () => {
    // `users` rows are upserted by the register endpoint's internal call, which
    // has already passed the registrations gate. Requiring a second token here
    // would demand two solves for one registration.
    expect(DEFAULT_WRITE_GUARD_POLICIES.users?.create?.turnstile).toBeUndefined()
  })
})
