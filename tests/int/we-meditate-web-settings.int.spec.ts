import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { WeMeditateWebSetting, Page, PageTag, MusicTag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('WeMeditateWebSettings Global', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testPages: Page[]
  let testPageTags: PageTag[]
  let testMusicTags: MusicTag[]

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test pages for static pages (6 required)
    testPages = await Promise.all([
      testData.createPage(payload, { title: 'Home Page' }),
      testData.createPage(payload, { title: 'Music Page' }),
      testData.createPage(payload, { title: 'Classes Page' }),
      testData.createPage(payload, { title: 'Subtle System Page' }),
      testData.createPage(payload, { title: 'Techniques Page' }),
      testData.createPage(payload, { title: 'Inspiration Page' }),
      // Additional pages for featured pages
      testData.createPage(payload, { title: 'Featured Page 1' }),
      testData.createPage(payload, { title: 'Featured Page 2' }),
      testData.createPage(payload, { title: 'Featured Page 3' }),
    ])

    // Create test page tags (3-5 required)
    testPageTags = await Promise.all([
      testData.createPageTag(payload, { name: 'wisdom', title: 'Wisdom' }),
      testData.createPageTag(payload, { name: 'living', title: 'Living' }),
      testData.createPageTag(payload, { name: 'creativity', title: 'Creativity' }),
    ])

    // Create test music tags (3-5 required)
    testMusicTags = await Promise.all([
      testData.createMusicTag(payload, { name: 'relaxation', title: 'Relaxation' }),
      testData.createMusicTag(payload, { name: 'meditation', title: 'Meditation' }),
      testData.createMusicTag(payload, { name: 'ambient', title: 'Ambient' }),
    ])
  }, 30000)

  afterAll(async () => {
    await cleanup()
  })

  it.skip('creates web settings with all required fields', async () => {
    const settings = await payload.updateGlobal({
      slug: 'we-meditate-web-settings',
      data: {
        homePage: testPages[0].id,
        musicPage: testPages[1].id,
        classesPage: testPages[2].id,
        subtleSystemPage: testPages[3].id,
        techniquesPage: testPages[4].id,
        inspirationPage: testPages[5].id,
        featuredPages: [testPages[6].id, testPages[7].id, testPages[8].id],
        inspirationPageTags: [testPageTags[0].id, testPageTags[1].id, testPageTags[2].id],
        musicPageTags: [testMusicTags[0].id, testMusicTags[1].id, testMusicTags[2].id],
      },
    })

    expect(settings).toBeDefined()
    expect(settings.homePage).toBeDefined()
    expect(settings.featuredPages).toHaveLength(3)
    expect(settings.inspirationPageTags).toHaveLength(3)
    expect(settings.musicPageTags).toHaveLength(3)
  })

  it('validates minRows constraint for featured pages (minimum 3)', async () => {
    await expect(
      payload.updateGlobal({
        slug: 'we-meditate-web-settings',
        data: {
          homePage: testPages[0].id,
          musicPage: testPages[1].id,
          classesPage: testPages[2].id,
          subtleSystemPage: testPages[3].id,
          techniquesPage: testPages[4].id,
          inspirationPage: testPages[5].id,
          featuredPages: [testPages[6].id, testPages[7].id], // Only 2 pages - should fail
          inspirationPageTags: [testPageTags[0].id, testPageTags[1].id, testPageTags[2].id],
          musicPageTags: [testMusicTags[0].id, testMusicTags[1].id, testMusicTags[2].id],
        },
      }),
    ).rejects.toThrow()
  })

  it('validates maxRows constraint for featured pages (maximum 7)', async () => {
    // Create additional pages to exceed the limit
    const extraPages = await Promise.all([
      testData.createPage(payload, { title: 'Extra Page 1' }),
      testData.createPage(payload, { title: 'Extra Page 2' }),
      testData.createPage(payload, { title: 'Extra Page 3' }),
      testData.createPage(payload, { title: 'Extra Page 4' }),
      testData.createPage(payload, { title: 'Extra Page 5' }),
    ])

    await expect(
      payload.updateGlobal({
        slug: 'we-meditate-web-settings',
        data: {
          homePage: testPages[0].id,
          musicPage: testPages[1].id,
          classesPage: testPages[2].id,
          subtleSystemPage: testPages[3].id,
          techniquesPage: testPages[4].id,
          inspirationPage: testPages[5].id,
          featuredPages: [
            testPages[6].id,
            testPages[7].id,
            testPages[8].id,
            extraPages[0].id,
            extraPages[1].id,
            extraPages[2].id,
            extraPages[3].id,
            extraPages[4].id, // 8 pages - should fail
          ],
          inspirationPageTags: [testPageTags[0].id, testPageTags[1].id, testPageTags[2].id],
          musicPageTags: [testMusicTags[0].id, testMusicTags[1].id, testMusicTags[2].id],
        },
      }),
    ).rejects.toThrow()
  })

  it('validates minRows constraint for inspiration page tags (minimum 3)', async () => {
    await expect(
      payload.updateGlobal({
        slug: 'we-meditate-web-settings',
        data: {
          homePage: testPages[0].id,
          musicPage: testPages[1].id,
          classesPage: testPages[2].id,
          subtleSystemPage: testPages[3].id,
          techniquesPage: testPages[4].id,
          inspirationPage: testPages[5].id,
          featuredPages: [testPages[6].id, testPages[7].id, testPages[8].id],
          inspirationPageTags: [testPageTags[0].id, testPageTags[1].id], // Only 2 tags - should fail
          musicPageTags: [testMusicTags[0].id, testMusicTags[1].id, testMusicTags[2].id],
        },
      }),
    ).rejects.toThrow()
  })

  it('validates maxRows constraint for music page tags (maximum 5)', async () => {
    // Create additional music tags to exceed the limit
    const extraMusicTags = await Promise.all([
      testData.createMusicTag(payload, { name: 'extra1', title: 'Extra 1' }),
      testData.createMusicTag(payload, { name: 'extra2', title: 'Extra 2' }),
      testData.createMusicTag(payload, { name: 'extra3', title: 'Extra 3' }),
    ])

    await expect(
      payload.updateGlobal({
        slug: 'we-meditate-web-settings',
        data: {
          homePage: testPages[0].id,
          musicPage: testPages[1].id,
          classesPage: testPages[2].id,
          subtleSystemPage: testPages[3].id,
          techniquesPage: testPages[4].id,
          inspirationPage: testPages[5].id,
          featuredPages: [testPages[6].id, testPages[7].id, testPages[8].id],
          inspirationPageTags: [testPageTags[0].id, testPageTags[1].id, testPageTags[2].id],
          musicPageTags: [
            testMusicTags[0].id,
            testMusicTags[1].id,
            testMusicTags[2].id,
            extraMusicTags[0].id,
            extraMusicTags[1].id,
            extraMusicTags[2].id, // 6 tags - should fail
          ],
        },
      }),
    ).rejects.toThrow()
  })

  it('enforces admin-only access control', async () => {
    const config = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
    expect(config).toBeDefined()
    expect(config?.access).toBeDefined()
    expect(typeof config?.access?.read).toBe('function')
    expect(typeof config?.access?.update).toBe('function')

    // Test that non-admin users are blocked
    const nonAdminUser = testData.dummyUser('managers', { admin: false })
    const readResult = await config?.access?.read?.({ req: { user: nonAdminUser } as any })
    expect(readResult).toBe(false)

    const updateResult = await config?.access?.update?.({ req: { user: nonAdminUser } as any })
    expect(updateResult).toBe(false)
  })

  it('allows admin users to access', async () => {
    const config = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
    const adminUser = testData.dummyUser('managers', { admin: true })
    const readResult = await config?.access?.read?.({ req: { user: adminUser } as any })
    expect(readResult).toBe(true)

    const updateResult = await config?.access?.update?.({ req: { user: adminUser } as any })
    expect(updateResult).toBe(true)
  })

  it('belongs to Configuration admin group', async () => {
    const config = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
    expect(config?.admin?.group).toBe('Configuration')
  })

  it('has correct label', async () => {
    const config = payload.globals.config.find((g) => g.slug === 'we-meditate-web-settings')
    expect(config?.label).toBe('We Meditate Web Config')
  })

  it.skip('maintains relationship integrity with pages and tags', async () => {
    const settings = await payload.findGlobal({
      slug: 'we-meditate-web-settings',
      depth: 1,
    })

    // Verify static pages are populated
    expect(settings.homePage).toBeDefined()
    if (typeof settings.homePage === 'object') {
      expect(settings.homePage.title).toBeDefined()
    }

    // Verify featured pages array is populated
    expect(Array.isArray(settings.featuredPages)).toBe(true)
    if (settings.featuredPages.length > 0 && typeof settings.featuredPages[0] === 'object') {
      expect(settings.featuredPages[0].title).toBeDefined()
    }

    // Verify page tags are populated
    expect(Array.isArray(settings.inspirationPageTags)).toBe(true)
    if (
      settings.inspirationPageTags.length > 0 &&
      typeof settings.inspirationPageTags[0] === 'object'
    ) {
      expect(settings.inspirationPageTags[0].title).toBeDefined()
    }
  })
})
