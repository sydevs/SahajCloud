import type { Payload } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import {
  DEFAULT_PROJECT,
  PROJECTS,
  getProjectLabel,
  getProjectOptions,
  isValidProject,
  type ProjectValue,
} from '../../src/lib/projects'
import { adminOnlyVisibility, handleProjectVisibility } from '../../src/lib/projectVisibility'
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

  describe('projects.ts utilities', () => {
    describe('PROJECTS constant', () => {
      it('should contain all four projects', () => {
        expect(PROJECTS).toHaveLength(4)
        expect(PROJECTS.map((p) => p.value)).toContain('all-content')
        expect(PROJECTS.map((p) => p.value)).toContain('wemeditate-web')
        expect(PROJECTS.map((p) => p.value)).toContain('wemeditate-app')
        expect(PROJECTS.map((p) => p.value)).toContain('sahaj-atlas')
      })
    })

    describe('DEFAULT_PROJECT', () => {
      it('should be all-content', () => {
        expect(DEFAULT_PROJECT).toBe('all-content')
      })
    })

    describe('getProjectLabel', () => {
      it('should return correct labels for known projects', () => {
        expect(getProjectLabel('all-content')).toBe('All Content')
        expect(getProjectLabel('wemeditate-web')).toBe('WeMeditate Web')
        expect(getProjectLabel('wemeditate-app')).toBe('WeMeditate App')
        expect(getProjectLabel('sahaj-atlas')).toBe('Sahaj Atlas')
      })

      it('should return the value for unknown projects', () => {
        expect(getProjectLabel('unknown' as ProjectValue)).toBe('unknown')
      })
    })

    describe('getProjectOptions', () => {
      it('should return options array for Payload fields', () => {
        const options = getProjectOptions()
        expect(options).toHaveLength(4)
        expect(options[0]).toHaveProperty('value')
        expect(options[0]).toHaveProperty('label')
      })
    })

    describe('isValidProject', () => {
      it('should return true for valid project values', () => {
        expect(isValidProject('all-content')).toBe(true)
        expect(isValidProject('wemeditate-web')).toBe(true)
        expect(isValidProject('wemeditate-app')).toBe(true)
        expect(isValidProject('sahaj-atlas')).toBe(true)
      })

      it('should return false for invalid project values', () => {
        expect(isValidProject('invalid')).toBe(false)
        expect(isValidProject('')).toBe(false)
        expect(isValidProject('wemeditate')).toBe(false)
      })
    })
  })

  describe('handleProjectVisibility', () => {
    describe('basic visibility', () => {
      it('should hide collection when user has no project', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: undefined })).toBe(true)
        expect(hiddenFn({ user: {} as any })).toBe(true)
      })

      it('should hide collection when project not in allowed list', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
      })

      it('should show collection when project in allowed list', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
      })

      it('should show collection when project in allowed list (multiple projects)', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web', 'wemeditate-app'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(false)
      })
    })

    describe('all-content mode', () => {
      it('should show collection in all-content mode by default', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(false)
      })

      it('should hide collection in all-content mode when excludeAllContent is true', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'], { excludeAllContent: true })
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(true)
      })

      it('should show collection in all-content mode when excludeAllContent is false', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'], { excludeAllContent: false })
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(false)
      })
    })
  })

  describe('adminOnlyVisibility', () => {
    it('should hide collection for non-admin users', () => {
      expect(adminOnlyVisibility({ user: undefined })).toBe(true)
      expect(adminOnlyVisibility({ user: {} as any })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: false } as any })).toBe(true)
    })

    it('should show collection for admin users', () => {
      expect(adminOnlyVisibility({ user: { admin: true } as any })).toBe(false)
    })

    it('should handle truthy non-boolean admin values safely', () => {
      // This tests the security fix: admin !== true (not just !admin)
      expect(adminOnlyVisibility({ user: { admin: 'yes' } as any })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: 1 } as any })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: {} } as any })).toBe(true)
    })
  })

  describe('Collection visibility integration', () => {
    it('should correctly filter Pages collection visibility', async () => {
      // Pages visible in: wemeditate-web
      const pagesCollection = payload.collections.pages
      const hiddenFn = pagesCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(false)
      }
    })

    it('should correctly filter Meditations collection visibility', async () => {
      // Meditations visible in: wemeditate-web, wemeditate-app
      const meditationsCollection = payload.collections.meditations
      const hiddenFn = meditationsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(false)
      }
    })

    it('should correctly filter Lessons collection visibility', async () => {
      // Lessons visible in: wemeditate-app
      const lessonsCollection = payload.collections.lessons
      const hiddenFn = lessonsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(false)
      }
    })
  })

  describe('Global visibility integration', () => {
    it('should correctly filter WeMeditate Web Settings visibility', async () => {
      // WeMeditate Web Settings visible in: wemeditate-web only (excludeAllContent: true)
      const webSettings = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
      const hiddenFn = webSettings?.admin?.hidden

      if (typeof hiddenFn === 'function') {
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'all-content' } as any })).toBe(true) // excludeAllContent
      }
    })
  })
})
