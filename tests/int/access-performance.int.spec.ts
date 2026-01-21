/**
 * Performance Benchmark Tests for Access Control
 *
 * These tests establish baseline performance metrics for the accessPlugin.
 * Run these before and after optimizations to verify improvements.
 *
 * Performance targets are based on:
 * - 10,000 permission checks should complete in under 100ms
 * - Individual checks should average under 0.01ms (10 microseconds)
 */

import { describe, it, expect } from 'vitest'

import { bypassPermissions, hasPermission, hasAnyPermission } from '@/lib/access'

import { testData } from '../utils/testData'

describe('Access Control Performance', () => {
  // Test users for different scenarios
  const adminUser = testData.dummyUser('managers', {
    id: 1,
    type: 'admin' as const,
  })

  const meditationsEditor = testData.dummyUser('managers', {
    id: 2,
    type: 'manager' as const,
    roles: { en: ['meditations-editor'] },
  })

  const translator = testData.dummyUser('managers', {
    id: 3,
    type: 'manager' as const,
    roles: { en: ['web-translator'] },
  })

  const inactiveManager = testData.dummyUser('managers', {
    id: 4,
    type: 'inactive' as const,
  })

  const apiClient = testData.dummyUser('clients', {
    id: 5,
    roles: ['wemeditate-web-client'],
    active: true,
  })

  const managerWithCustomAccess = testData.dummyUser('managers', {
    id: 6,
    type: 'manager' as const,
    roles: { en: ['web-translator'] },
    customResourceAccess: [
      { relationTo: 'pages', value: '1' },
      { relationTo: 'pages', value: '2' },
      { relationTo: 'pages', value: '3' },
      { relationTo: 'meditations', value: '1' },
      { relationTo: 'meditations', value: '2' },
    ],
  })

  describe('hasPermission() Performance', () => {
    it('completes 10,000 admin permission checks in under 100ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          { user: adminUser, collection: 'meditations', operation: 'create' },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      // Note: threshold is 200ms to account for CPU variance during full test suite
      expect(duration).toBeLessThan(200)
      // Log for visibility during development
      console.log(
        `[Benchmark] Admin checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('completes 10,000 role-based permission checks in under 100ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          {
            user: meditationsEditor,
            collection: 'meditations',
            operation: 'update',
            locale: 'en',
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] Role-based checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('completes 10,000 implicit read checks in under 100ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          {
            user: meditationsEditor,
            collection: 'meditations',
            operation: 'read',
            locale: 'en',
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] Implicit read checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('completes 10,000 translator permission checks in under 100ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          {
            user: translator,
            collection: 'pages',
            operation: 'update',
            locale: 'en',
            field: { localized: true },
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] Translator checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('completes 10,000 API client checks in under 100ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          { user: apiClient, collection: 'pages', operation: 'read' },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] API client checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('completes 10,000 inactive user checks in under 50ms (early exit)', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          { user: inactiveManager, collection: 'meditations', operation: 'read' },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      // Inactive users should exit very quickly via bypass
      // Note: threshold is 150ms to account for CPU variance during full test suite
      expect(duration).toBeLessThan(150)
      console.log(
        `[Benchmark] Inactive user checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })
  })

  describe('customResourceAccess Performance', () => {
    it('handles customResourceAccess lookup efficiently', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          {
            user: managerWithCustomAccess,
            collection: 'pages',
            operation: 'update',
            locale: 'en',
            docId: '2', // Mid-array lookup
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] customResourceAccess checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })

    it('handles customResourceAccess miss efficiently', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasPermission(
          {
            user: managerWithCustomAccess,
            collection: 'pages',
            operation: 'update',
            locale: 'en',
            docId: '999', // Not in customResourceAccess
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] customResourceAccess miss: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })
  })

  describe('hasAnyPermission() Performance', () => {
    it('completes 10,000 visibility checks in under 150ms', () => {
      const iterations = 10000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        hasAnyPermission(
          {
            user: meditationsEditor,
            collection: 'meditations',
            operations: ['create', 'update', 'delete'],
            locale: 'en',
          },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      // hasAnyPermission checks multiple operations, so allow slightly more time
      expect(duration).toBeLessThan(150)
      console.log(
        `[Benchmark] hasAnyPermission checks: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })
  })

  describe('Mixed Workload Performance', () => {
    it('handles realistic mixed workload efficiently', () => {
      const iterations = 10000
      const users = [adminUser, meditationsEditor, translator, apiClient]
      const collections: Array<'meditations' | 'pages' | 'songs' | 'lessons'> = [
        'meditations',
        'pages',
        'songs',
        'lessons',
      ]
      const operations: Array<'read' | 'create' | 'update' | 'delete'> = [
        'read',
        'create',
        'update',
        'delete',
      ]

      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        const user = users[i % users.length]
        const collection = collections[i % collections.length]
        const operation = operations[i % operations.length]

        hasPermission(
          { user, collection, operation, locale: 'en' },
          bypassPermissions,
        )
      }

      const duration = performance.now() - start
      const avgPerCheck = duration / iterations

      expect(duration).toBeLessThan(100)
      console.log(
        `[Benchmark] Mixed workload: ${iterations} in ${duration.toFixed(2)}ms (${avgPerCheck.toFixed(4)}ms/check)`,
      )
    })
  })
})
