/**
 * Unit tests for `shouldRedirectToAdmin` — the pure decision that drives
 * ProjectSelector's in-place-refresh-vs-navigate-to-/admin choice (#532).
 *
 * No Payload bootstrap: the helper only consults the access plugin's
 * project→collection lookup tables via `isCollectionVisibleInProject`.
 */
import { describe, expect, it } from 'vitest'

import { shouldRedirectToAdmin } from '@/components/admin/ProjectSelector/utils'

describe('shouldRedirectToAdmin', () => {
  it('never redirects from a non-content route (dashboard, account, analytics)', () => {
    for (const path of [
      '/admin',
      '/admin/analytics',
      '/admin/account',
      '/admin/create-first-user',
    ]) {
      expect(shouldRedirectToAdmin(path, 'sahaj-atlas')).toBe(false)
    }
  })

  it('stays in place when the current collection remains visible under the new project', () => {
    // images/files are shared across every project → always visible.
    expect(shouldRedirectToAdmin('/admin/collections/images/5', 'sahaj-atlas')).toBe(false)
    // meditations belongs to both wemeditate projects.
    expect(shouldRedirectToAdmin('/admin/collections/meditations/12', 'wemeditate-app')).toBe(false)
  })

  it('redirects when the current collection becomes hidden under the new project', () => {
    // meditations is not part of sahaj-atlas.
    expect(shouldRedirectToAdmin('/admin/collections/meditations/12', 'sahaj-atlas')).toBe(true)
    // events belong only to sahaj-atlas.
    expect(shouldRedirectToAdmin('/admin/collections/events', 'wemeditate-web')).toBe(true)
  })

  it('treats globals the same as collections', () => {
    // wm-web-config is a wemeditate-web global.
    expect(shouldRedirectToAdmin('/admin/globals/wm-web-config', 'wemeditate-web')).toBe(false)
    expect(shouldRedirectToAdmin('/admin/globals/wm-web-config', 'sahaj-atlas')).toBe(true)
  })

  it('never redirects when switching to the admin "All Content" view (null)', () => {
    expect(shouldRedirectToAdmin('/admin/collections/meditations/12', null)).toBe(false)
    expect(shouldRedirectToAdmin('/admin/collections/events', null)).toBe(false)
  })

  it('never redirects for a collection scoped to no project (admin-only, shared)', () => {
    // managers is admin-only / in no project → always visible.
    expect(shouldRedirectToAdmin('/admin/collections/managers/1', 'sahaj-atlas')).toBe(false)
  })

  it('parses the slug from list, create, and edit routes alike', () => {
    expect(shouldRedirectToAdmin('/admin/collections/meditations', 'sahaj-atlas')).toBe(true)
    expect(shouldRedirectToAdmin('/admin/collections/meditations/create', 'sahaj-atlas')).toBe(true)
    expect(shouldRedirectToAdmin('/admin/collections/meditations/12', 'sahaj-atlas')).toBe(true)
  })
})
