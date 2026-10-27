import type { PayloadRequest, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import { slugField } from '../../src/fields/slugField'

/**
 * The override's answer for a blank source decides whether a unique-indexed
 * slug column gets NULL or `''` — and Postgres admits many NULLs but one `''`
 * (#1038). Both halves below are load-bearing in opposite directions, so a
 * change to either is a change to what a collection can store.
 */
describe('slugField blank-source slugify', () => {
  // Payload exposes the resolved function here for its own server action.
  const slugify = (slugField().fields[1] as TextField).custom!.slugify as (args: {
    valueToSlugify?: unknown
  }) => string | undefined

  const run = (valueToSlugify?: unknown) =>
    slugify({ valueToSlugify } as { data: never; req: PayloadRequest; valueToSlugify?: unknown })

  it('answers undefined for a blank source, so the column stays NULL', () => {
    expect(run(undefined)).toBeUndefined()
    expect(run(null)).toBeUndefined()
    expect(run('')).toBeUndefined()
  })

  it('answers the empty string for a source that transliterates to nothing', () => {
    // Parity with Payload's own default. The collections whose slug column is
    // NOT NULL (`authors`, `song_tags`, `user_choices`, `regions`) would take a
    // constraint violation instead of the row they store today.
    expect(run('東京')).toBe('')
    expect(run('!!!')).toBe('')
  })

  it('still transliterates a non-Latin source it can read', () => {
    expect(run('Москва')).toBe('moskva')
    expect(run('My First Page')).toBe('my-first-page')
  })
})
