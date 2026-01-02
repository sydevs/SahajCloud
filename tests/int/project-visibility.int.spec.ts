/**
 * Project Visibility Tests
 *
 * Tests the admin.hidden function generation for project-based collection visibility.
 * These test our custom createHidden() logic from accessPlugin.
 */

import type { Payload } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

describe('Project Visibility System', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Collection visibility integration', () => {
    // Note: These tests use admin users (type: 'admin') to bypass permission checks
    // and test the project visibility logic specifically

    it('should correctly filter Pages collection visibility', async () => {
      // Pages visible in: wemeditate-web only
      const pagesCollection = payload.collections.pages
      const hiddenFn = pagesCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })

    it('should correctly filter Meditations collection visibility', async () => {
      // Meditations visible in: wemeditate-web, wemeditate-app
      const meditationsCollection = payload.collections.meditations
      const hiddenFn = meditationsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })

    it('should correctly filter Lessons collection visibility', async () => {
      // Lessons visible in: wemeditate-app only
      const lessonsCollection = payload.collections.lessons
      const hiddenFn = lessonsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })
  })

  describe('Global visibility integration', () => {
    it('should correctly filter WeMeditate Web Settings visibility', async () => {
      // WeMeditate Web Settings visible in: wemeditate-web only (excludeFromAdminView: true)
      const webSettings = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
      const hiddenFn = webSettings?.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { type: 'admin', currentProject: null } as any })).toBe(true) // excludeFromAdminView: true hides from all users
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: false } as any })).toBe(true) // non-admin also hidden
      }
    })
  })
})
