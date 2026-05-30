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
      // Pages visible in: wemeditate-web, wemeditate-app
      const pagesCollection = payload.collections.pages
      const hiddenFn = pagesCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // Note: collection: 'managers' required for bypass function to recognize admin users
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })

    it('should correctly filter Meditations collection visibility', async () => {
      // Meditations visible in: wemeditate-web, wemeditate-app
      const meditationsCollection = payload.collections.meditations
      const hiddenFn = meditationsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // Note: collection: 'managers' required for bypass function to recognize admin users
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })

    it('should correctly filter Lessons collection visibility', async () => {
      // Lessons visible in: wemeditate-app only
      const lessonsCollection = payload.collections.lessons
      const hiddenFn = lessonsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // Note: collection: 'managers' required for bypass function to recognize admin users
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(true)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })
  })

  describe('Global visibility integration', () => {
    it('should correctly filter WeMeditate Web Config visibility', async () => {
      // WeMeditate Web Config visible in: wemeditate-web only
      const webConfig = payload.globals.config.find((g) => g.slug === 'wm-web-config')
      const hiddenFn = webConfig?.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using admin mock objects to test project visibility logic
        // Note: collection: 'managers' required for bypass function to recognize admin users
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-web' } as any })).toBe(false)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'wemeditate-app' } as any })).toBe(true)
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // Admin view (null) sees all globals
         
        expect(hiddenFn({ user: { collection: 'managers', type: 'admin', currentProject: null } as any })).toBe(false)
      }
    })
  })
})
