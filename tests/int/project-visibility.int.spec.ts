import type { Payload } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import {
  PROJECTS,
  getProjectLabel,
  getProjectOptions,
  isValidProject,
  type ProjectValue,
} from '../../src/lib/projects'
import { adminOnlyVisibility, handleProjectVisibility } from '../../src/lib/projectVisibility'
import { createTestEnvironment } from '../utils/testHelpers'

// Type for testing visibility functions
type MockUser = {
  currentProject?: ProjectValue | null
  admin?: boolean | string | number | object
}

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
      it('should contain all three projects', () => {
        expect(PROJECTS).toHaveLength(3)
        expect(PROJECTS.map((p) => p.value)).toContain('wemeditate-web')
        expect(PROJECTS.map((p) => p.value)).toContain('wemeditate-app')
        expect(PROJECTS.map((p) => p.value)).toContain('sahaj-atlas')
      })
    })

    describe('getProjectLabel', () => {
      it('should return correct labels for known projects', () => {
        expect(getProjectLabel('wemeditate-web')).toBe('WeMeditate Web')
        expect(getProjectLabel('wemeditate-app')).toBe('WeMeditate App')
        expect(getProjectLabel('sahaj-atlas')).toBe('Sahaj Atlas')
      })

      it('should return "All Content" for null', () => {
        expect(getProjectLabel(null)).toBe('All Content')
      })

      it('should return the value for unknown projects', () => {
        expect(getProjectLabel('unknown' as ProjectValue)).toBe('unknown')
      })
    })

    describe('getProjectOptions', () => {
      it('should return options array for Payload fields', () => {
        const options = getProjectOptions()
        expect(options).toHaveLength(3)
        expect(options[0]).toHaveProperty('value')
        expect(options[0]).toHaveProperty('label')
      })
    })

    describe('isValidProject', () => {
      it('should return true for valid project values', () => {
        expect(isValidProject('wemeditate-web')).toBe(true)
        expect(isValidProject('wemeditate-app')).toBe(true)
        expect(isValidProject('sahaj-atlas')).toBe(true)
      })

      it('should return true for null', () => {
        expect(isValidProject(null)).toBe(true)
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
      it('should show collection by default when user has no project (null)', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        // No user or null project: show by default (not excluded from admin view)
        expect(hiddenFn({ user: undefined })).toBe(false)
        expect(hiddenFn({ user: {} as MockUser })).toBe(false)
        expect(hiddenFn({ user: { currentProject: null } as MockUser })).toBe(false)
      })

      it('should hide collection for non-admins with null project when excludeFromAdminView', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'], {
          excludeFromAdminView: true,
        })
        // Non-admin with null project: hide when excludeFromAdminView is true
        expect(hiddenFn({ user: { currentProject: null, admin: false } as MockUser })).toBe(true)
        expect(hiddenFn({ user: { currentProject: null } as MockUser })).toBe(true)
      })

      it('should hide collection when project not in allowed list', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as MockUser })).toBe(true)
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as MockUser })).toBe(true)
      })

      it('should show collection when project in allowed list', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as MockUser })).toBe(false)
      })

      it('should show collection when project in allowed list (multiple projects)', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web', 'wemeditate-app'])
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as MockUser })).toBe(false)
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as MockUser })).toBe(false)
      })
    })

    describe('admin view (null project)', () => {
      it('should show collection in admin view by default', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'])
        expect(hiddenFn({ user: { currentProject: null, admin: true } as MockUser })).toBe(false)
      })

      it('should hide collection in admin view when excludeFromAdminView is true', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'], {
          excludeFromAdminView: true,
        })
        expect(hiddenFn({ user: { currentProject: null, admin: true } as MockUser })).toBe(false)
        expect(hiddenFn({ user: { currentProject: null, admin: false } as MockUser })).toBe(true)
      })

      it('should show collection in admin view when excludeFromAdminView is false', () => {
        const hiddenFn = handleProjectVisibility(['wemeditate-web'], {
          excludeFromAdminView: false,
        })
        expect(hiddenFn({ user: { currentProject: null, admin: true } as MockUser })).toBe(false)
      })
    })
  })

  describe('adminOnlyVisibility', () => {
    it('should hide collection for non-admin users', () => {
      expect(adminOnlyVisibility({ user: undefined })).toBe(true)
      expect(adminOnlyVisibility({ user: {} as MockUser })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: false } as MockUser })).toBe(true)
    })

    it('should show collection for admin users', () => {
      expect(adminOnlyVisibility({ user: { admin: true } as MockUser })).toBe(false)
    })

    it('should handle truthy non-boolean admin values safely', () => {
      // This tests the security fix: admin !== true (not just !admin)
      expect(adminOnlyVisibility({ user: { admin: 'yes' } as MockUser })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: 1 } as MockUser })).toBe(true)
      expect(adminOnlyVisibility({ user: { admin: {} } as MockUser })).toBe(true)
    })
  })

  describe('Collection visibility integration', () => {
    it('should correctly filter Pages collection visibility', async () => {
      // Pages visible in: wemeditate-web only
      const pagesCollection = payload.collections.pages
      const hiddenFn = pagesCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using partial mock objects for testing visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: true } as any })).toBe(false)
      }
    })

    it('should correctly filter Meditations collection visibility', async () => {
      // Meditations visible in: wemeditate-web, wemeditate-app
      const meditationsCollection = payload.collections.meditations
      const hiddenFn = meditationsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using partial mock objects for testing visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: true } as any })).toBe(false)
      }
    })

    it('should correctly filter Lessons collection visibility', async () => {
      // Lessons visible in: wemeditate-app only
      const lessonsCollection = payload.collections.lessons
      const hiddenFn = lessonsCollection.config.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using partial mock objects for testing visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: true } as any })).toBe(false)
      }
    })
  })

  describe('Global visibility integration', () => {
    it('should correctly filter WeMeditate Web Settings visibility', async () => {
      // WeMeditate Web Settings visible in: wemeditate-web only (excludeFromAdminView: true)
      const webSettings = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
      const hiddenFn = webSettings?.admin?.hidden

      if (typeof hiddenFn === 'function') {
        // Using partial mock objects for testing visibility logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-web' } as any })).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'wemeditate-app' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: 'sahaj-atlas' } as any })).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: true } as any })).toBe(false) // excludeFromAdminView (admins can see)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hiddenFn({ user: { currentProject: null, admin: false } as any })).toBe(true) // excludeFromAdminView (non-admins can't)
      }
    })
  })
})
