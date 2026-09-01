import { describe, expect, it } from 'vitest'

import { DEFAULT_WRITE_GUARD_POLICIES } from '@/plugins/writeGuard/policies'

/**
 * The policy map IS the public write surface, and nothing pinned it until #629.
 *
 * That matters more than a normal config test, because the map fails *open* in
 * one specific direction: an absent knob means "don't run that check". So a
 * dropped `turnstile: true` does not break a build, fail a type-check or throw
 * at boot — it silently reopens a captcha-free public write path, and every
 * other test in the suite keeps passing. The integration lane catches it only
 * for paths that have a spec exercising a refusal.
 */
describe('DEFAULT_WRITE_GUARD_POLICIES', () => {
  /**
   * Every collection a client may create through. Registrations joined this
   * list in #629, once the Atlas widget began sending the header
   * (sydevs/SahajAtlasWeb#182).
   */
  const PUBLIC_CREATE_PATHS = ['event-submissions', 'user-messages', 'registrations'] as const

  it.each(PUBLIC_CREATE_PATHS)('requires Turnstile on %s create', (slug) => {
    expect(DEFAULT_WRITE_GUARD_POLICIES[slug]?.create?.turnstile).toBe(true)
  })

  it('scans the registration questions blob for URLs as well as gating it', () => {
    // The captcha stops bulk automation; the URL scan is what stops a human
    // spammer typing a link into a free-text answer. Neither replaces the other.
    expect(DEFAULT_WRITE_GUARD_POLICIES.registrations?.create?.urlScanFields).toContain('questions')
  })

  it('leaves users create without Turnstile, because no client posts to it directly', () => {
    // `users` rows are upserted by the register endpoint's internal call, which
    // has already passed the registrations gate. Requiring a second token here
    // would demand two solves for one registration.
    expect(DEFAULT_WRITE_GUARD_POLICIES.users?.create?.turnstile).toBeUndefined()
  })
})
