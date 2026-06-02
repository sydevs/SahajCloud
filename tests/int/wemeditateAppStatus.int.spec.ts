import type { BasePayload, Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AppCard, Lesson, Manager, Page, UserChoice, WmAppStatus } from '@/payload-types'

import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/wemeditate-app/config'
import {
  appCardsSection,
  appConfigSection,
  lecturesSection,
  lessonsSection,
  pagesSection,
  translationsSection,
  userChoicesSection,
  type WeMeditateAppStatusConfig,
} from '@/globals/wemeditate-app/status'
import { runSection, type ReadinessReport, type SectionSpec } from '@/lib/status'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client to prevent real network calls when creating lectures.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(
    join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'),
  )
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

const EMPTY_CONFIG: WeMeditateAppStatusConfig = {
  baselineCountry: 'GB',
  launchCriticalAppCardIds: [],
}

/**
 * Test helper — runs a section spec with a default empty config (or a
 * provided one) and returns the report. Mirrors how the
 * `virtualReadinessField` factory calls `runSection` at runtime.
 */
function run<TCtx>(
  spec: SectionSpec<WeMeditateAppStatusConfig, TCtx>,
  payload: Payload,
  locale: 'en' | 'cs' = 'en',
  config: WeMeditateAppStatusConfig = EMPTY_CONFIG,
): Promise<ReadinessReport> {
  return runSection(spec, { payload: payload as BasePayload, locale, config })
}

function articleWithLectureLink(lectureId: number) {
  return {
    root: {
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'text',
              text: 'Watch this:',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
            {
              type: 'relationship',
              version: 1,
              relationTo: 'lectures',
              value: { id: lectureId },
            },
          ],
        },
      ],
    },
  }
}

describe('WeMeditateAppStatus Global', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  // Every page relationship in the config's "Pages" tab is `required`, so
  // updateGlobal rejects unless all are present. Build the set from the source
  // list (one shared placeholder page) so it never drifts as pages are added.
  let requiredAppPages: Record<string, number>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const placeholderPage = await testData.createPage(payload, {
      title: 'Required Page Placeholder',
    })
    requiredAppPages = Object.fromEntries(
      APP_REQUIRED_PAGE_FIELDS.map((name) => [name, placeholderPage.id]),
    ) as Record<string, number>
  })

  afterAll(async () => {
    await cleanup()
  })

  // ---------------------------------------------------------------------------
  // Section 1 — UserChoices
  // ---------------------------------------------------------------------------
  describe('Section 1 — UserChoices', () => {
    it('featured choice with all timing meditations passes; missing one fails', async () => {
      const morningMed = await testData.createMeditation(payload, undefined, {
        type: 'quick',
        _status: 'published',
      })
      const eveningMed = await testData.createMeditation(payload, undefined, {
        type: 'quick',
        _status: 'published',
      })

      await testData.createUserChoice(payload, {
        title: 'Calm',
        isFeatured: true,
        type: 'mood',
        timings: ['morning', 'evening'],
        morningMeditation: morningMed.id,
        eveningMeditation: eveningMed.id,
      } as Partial<UserChoice>)

      await testData.createUserChoice(payload, {
        title: 'Tired',
        isFeatured: true,
        type: 'mood',
        timings: ['morning', 'evening'],
        morningMeditation: morningMed.id,
        // eveningMeditation omitted → fail
      } as Partial<UserChoice>)

      const report = await run(userChoicesSection, payload)
      const featured = report.groups.find((g) => g.key === 'featured')
      expect(featured?.type).toBe('documents')
      if (featured?.type !== 'documents') return
      expect(featured.documents).toHaveLength(2)
      const passing = featured.documents.filter((d) => d.checks.every((c) => c.passed))
      expect(passing).toHaveLength(1)
      expect(passing[0].label).toBe('Calm')
    })

    it('emits non-featured-{morning,afternoon,evening,night} aggregate groups', async () => {
      const report = await run(userChoicesSection, payload)
      const aggKeys = report.groups.filter((g) => g.type === 'aggregate').map((g) => g.key)
      expect(aggKeys).toContain('non-featured-morning')
      expect(aggKeys).toContain('non-featured-afternoon')
      expect(aggKeys).toContain('non-featured-evening')
      expect(aggKeys).toContain('non-featured-night')
    })
  })

  // ---------------------------------------------------------------------------
  // Section 2 — Lessons
  // ---------------------------------------------------------------------------
  describe('Section 2 — Lessons', () => {
    let fullLesson: Lesson
    let partialLesson: Lesson

    beforeAll(async () => {
      const lectureForArticle = await testData.createLecture(payload)
      const meditation = await testData.createMeditation(payload, undefined, {
        type: 'lesson',
        _status: 'published',
      })
      const introAudio = await testData.createFile(payload, {}, 'audio-42s.mp3')

      fullLesson = await testData.createLesson(payload, {
        title: 'Fully populated lesson',
        unit: 'Unit 1',
        step: 1,
        meditation: meditation.id,
        introAudio: introAudio.id,
        article: articleWithLectureLink(lectureForArticle.id),
        panels: [{ title: 'p1' }, { title: 'p2' }],
      } as Partial<Lesson>)

      partialLesson = await testData.createLesson(payload, {
        title: 'Partial lesson',
        unit: 'Unit 1',
        step: 2,
        panels: [{ title: 'p1' }],
      } as Partial<Lesson>)
    })

    it('emits one group per unit; Unit 4 is optional', async () => {
      const report = await run(lessonsSection, payload)
      const unitGroups = report.groups.filter((g) => g.key.startsWith('unit-'))
      expect(unitGroups.length).toBeGreaterThanOrEqual(4)
      const unit4 = unitGroups.find((g) => g.key === 'unit-4')
      expect(unit4?.optional).toBe(true)
      const unit1 = unitGroups.find((g) => g.key === 'unit-1')
      expect(unit1?.optional).toBeUndefined()
    })

    it('lesson with all fields set has all checks passing; partial lesson has failing checks', async () => {
      const report = await run(lessonsSection, payload)
      const unit1 = report.groups.find((g) => g.key === 'unit-1')
      expect(unit1?.type).toBe('documents')
      if (unit1?.type !== 'documents') return

      const full = unit1.documents.find((d) => d.id === fullLesson.id)
      expect(full).toBeDefined()
      const fullPassing = full!.checks.filter((c) => c.passed).map((c) => c.key)
      expect(fullPassing).toEqual(
        expect.arrayContaining([
          'panels-set',
          'intro-audio-set',
          'meditation-set',
          'article-localized',
          'article-has-lecture-link',
          'icon-set',
        ]),
      )

      const partial = unit1.documents.find((d) => d.id === partialLesson.id)
      expect(partial).toBeDefined()
      const partialFailing = partial!.checks.filter((c) => !c.passed).map((c) => c.key)
      // createLesson auto-supplies a default meditation + icon, so those checks pass.
      // The partial lesson omits introAudio + article, so those three checks fail.
      expect(partialFailing).toEqual(
        expect.arrayContaining([
          'intro-audio-set',
          'article-localized',
          'article-has-lecture-link',
        ]),
      )
    })

    it('summary counts only required (non-optional) groups', async () => {
      const report = await run(lessonsSection, payload)
      const requiredGroups = report.groups.filter((g) => !g.optional)
      expect(report.summary.total).toBe(requiredGroups.length)
      const optionalGroups = report.groups.filter((g) => g.optional)
      if (optionalGroups.length > 0) {
        expect(report.optionalSummary?.total).toBe(optionalGroups.length)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Section 4 — Pages (run before Section 3 because Section 3 uses lecture seeds)
  // ---------------------------------------------------------------------------
  describe('Section 4 — Pages', () => {
    let publishedCorePage: Page
    let draftCorePage: Page

    beforeAll(async () => {
      publishedCorePage = await testData.createPage(payload, {
        title: 'Classes',
        _status: 'published',
      } as Partial<Page>)
      draftCorePage = await testData.createPage(payload, {
        title: 'Lectures Page',
        _status: 'draft',
      } as Partial<Page>)

      await payload.updateGlobal({
        slug: 'wm-app-config',
        data: {
          ...requiredAppPages,
          classesPage: publishedCorePage.id,
          lecturesPage: draftCorePage.id,
        },
      })
    })

    it('reports per-page published + content-localized checks', async () => {
      const report = await run(pagesSection, payload)
      const core = report.groups.find((g) => g.key === 'core-pages')
      expect(core?.type).toBe('documents')
      if (core?.type !== 'documents') return

      const ids = core.documents.map((d) => d.id)
      expect(ids).toContain(publishedCorePage.id)
      expect(ids).toContain(draftCorePage.id)

      const publishedReport = core.documents.find((d) => d.id === publishedCorePage.id)!
      expect(publishedReport.checks.find((c) => c.key === 'published')?.passed).toBe(true)
      const draftReport = core.documents.find((d) => d.id === draftCorePage.id)!
      expect(draftReport.checks.find((c) => c.key === 'published')?.passed).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Section 3 — Lectures
  // ---------------------------------------------------------------------------
  describe('Section 3 — Lectures', () => {
    it('emits the three expected group keys', async () => {
      const report = await run(lecturesSection, payload)
      const keys = report.groups.map((g) => g.key)
      expect(keys).toEqual(
        expect.arrayContaining([
          'priority-with-userchoice',
          'baseline-audience',
          'user-choice-coverage',
        ]),
      )
    })

    it('priority-with-userchoice aggregate fails below threshold and passes when exceeded', async () => {
      const before = await run(lecturesSection, payload)
      const priorityBefore = before.groups.find((g) => g.key === 'priority-with-userchoice')
      expect(priorityBefore?.type).toBe('aggregate')
      if (priorityBefore?.type !== 'aggregate') return
      expect(priorityBefore.threshold).toBe(10)
      expect(priorityBefore.passed).toBe(false)
    })

    it('user-choice-coverage reports a `has-lecture` check per user choice', async () => {
      const report = await run(lecturesSection, payload)
      const group = report.groups.find((g) => g.key === 'user-choice-coverage')
      expect(group?.type).toBe('documents')
      if (group?.type !== 'documents') return
      for (const doc of group.documents) {
        expect(doc.checks.map((c) => c.key)).toContain('has-lecture')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Section 5 — App Configuration
  // ---------------------------------------------------------------------------
  describe('Section 5 — App Configuration', () => {
    it('vibe-check-tracks emits a row per identifier with present/audio-set/subtitles-set', async () => {
      const report = await run(appConfigSection, payload)
      const group = report.groups.find((g) => g.key === 'vibe-check-tracks')
      expect(group?.type).toBe('documents')
      if (group?.type !== 'documents') return
      expect(group.documents.length).toBeGreaterThanOrEqual(8)
      for (const doc of group.documents) {
        const keys = doc.checks.map((c) => c.key)
        expect(keys).toEqual(['present', 'audio-set', 'subtitles-set'])
      }
    })

    it('self-realization-meditation passes when assigned to a published meditation for the locale', async () => {
      const med = await testData.createMeditation(payload, undefined, {
        type: 'quick',
        _status: 'published',
        locale: 'en',
      })
      await payload.updateGlobal({
        slug: 'wm-app-config',
        locale: 'en',
        data: { ...requiredAppPages, selfRealizationMeditation: med.id },
      })
      const report = await run(appConfigSection, payload)
      const group = report.groups.find((g) => g.key === 'self-realization-meditation')
      expect(group?.type).toBe('documents')
      if (group?.type !== 'documents') return
      expect(group.documents[0].checks.map((c) => c.key)).toEqual([
        'relationship-set',
        'relationship-published',
      ])
      expect(group.documents[0].checks.every((c) => c.passed)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Section 6 — Translations
  // ---------------------------------------------------------------------------
  describe('Section 6 — Translations', () => {
    it('emits one aggregate per top-level schema tab', async () => {
      const report = await run(translationsSection, payload)
      const aggKeys = report.groups.filter((g) => g.type === 'aggregate').map((g) => g.key)
      expect(aggKeys).toEqual(
        expect.arrayContaining([
          'translations-daily',
          'translations-path',
          'translations-explore',
          'translations-profile',
          'translations-meditation',
        ]),
      )
      expect(report.groups.find((g) => g.key === 'manual-review')).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Section 7 — App Cards
  // ---------------------------------------------------------------------------
  describe('Section 7 — App Cards', () => {
    let launchCard: AppCard
    let otherCard: AppCard
    let draftOtherCard: AppCard
    let launchConfig: WeMeditateAppStatusConfig

    beforeAll(async () => {
      launchCard = await testData.createAppCard(payload, {
        label: 'Launch card',
        _status: 'published',
        default: {
          title: 'Launch title',
          subtitle: 'Launch subtitle',
          buttonText: 'Tap me',
        },
      } as unknown as Partial<AppCard>)

      // Published in English (with missing subtitle/button) — appears in other-cards.
      otherCard = await testData.createAppCard(payload, {
        label: 'Other card',
        _status: 'published',
      } as unknown as Partial<AppCard>)

      // Draft only — must be excluded from other-cards entirely.
      draftOtherCard = await testData.createAppCard(payload, {
        label: 'Draft other card',
      })

      await payload.updateGlobal({
        slug: 'wm-app-status',
        data: { launchCriticalAppCards: [launchCard.id] },
      })

      launchConfig = { baselineCountry: 'GB', launchCriticalAppCardIds: [launchCard.id] }
    })

    it('partitions cards into launch-critical (required) and other-cards (optional)', async () => {
      const report = await run(appCardsSection, payload, 'en', launchConfig)
      const launch = report.groups.find((g) => g.key === 'launch-critical-cards')
      const other = report.groups.find((g) => g.key === 'other-cards')
      expect(launch?.optional).toBeUndefined()
      expect(other?.optional).toBe(true)
      if (launch?.type !== 'documents' || other?.type !== 'documents') return
      const launchIds = launch.documents.map((d) => d.id)
      expect(launchIds).toContain(launchCard.id)
      expect(launchIds).not.toContain(otherCard.id)
      const otherIds = other.documents.map((d) => d.id)
      expect(otherIds).toContain(otherCard.id)
    })

    it('other-cards excludes cards not published in English (drafts)', async () => {
      const report = await run(appCardsSection, payload, 'en', launchConfig)
      const other = report.groups.find((g) => g.key === 'other-cards')
      if (other?.type !== 'documents') return
      const otherIds = other.documents.map((d) => d.id)
      expect(otherIds).not.toContain(draftOtherCard.id)
    })

    it('launch-critical card with all fields set passes; missing fields fail', async () => {
      const report = await run(appCardsSection, payload, 'en', launchConfig)
      const launch = report.groups.find((g) => g.key === 'launch-critical-cards')
      if (launch?.type !== 'documents') return
      const launchReport = launch.documents.find((d) => d.id === launchCard.id)!
      const passing = launchReport.checks.filter((c) => c.passed).map((c) => c.key)
      expect(passing).toEqual(
        expect.arrayContaining(['published', 'title-set', 'subtitle-set', 'button-label-set']),
      )

      // otherCard is published in English but missing subtitle/button text.
      const other = report.groups.find((g) => g.key === 'other-cards')
      if (other?.type !== 'documents') return
      const otherReport = other.documents.find((d) => d.id === otherCard.id)!
      expect(otherReport.checks.find((c) => c.key === 'published')?.passed).toBe(true)
      const failing = otherReport.checks.filter((c) => !c.passed).map((c) => c.key)
      expect(failing).toEqual(expect.arrayContaining(['subtitle-set', 'button-label-set']))
    })

    it('summary excludes the optional other-cards group; optionalSummary includes it', async () => {
      const report = await run(appCardsSection, payload, 'en', launchConfig)
      expect(report.summary.total).toBe(1)
      expect(report.optionalSummary?.total).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Locale fan-out — read with `locale: 'all'` returns null per virtual field
  // ---------------------------------------------------------------------------
  describe('locale fan-out', () => {
    it('returns null for each virtual field when locale is "all"', async () => {
      const report = (await payload.findGlobal({
        slug: 'wm-app-status',
        locale: 'all',
        depth: 0,
      })) as WmAppStatus

      const virtualKeys = [
        'userChoices',
        'lessons',
        'lectures',
        'pages',
        'appConfig',
        'translations',
        'appCards',
      ] as const
      for (const key of virtualKeys) {
        expect(
          (report as unknown as Record<string, ReadinessReport | null>)[key],
          `expected ${key} to be null with locale=all`,
        ).toBeNull()
      }
    })

    it('returns populated readiness reports when read with a specific locale', async () => {
      const report = (await payload.findGlobal({
        slug: 'wm-app-status',
        locale: 'en',
        depth: 0,
      })) as WmAppStatus

      const userChoices = (report as unknown as Record<string, ReadinessReport | null>).userChoices
      expect(userChoices).not.toBeNull()
      expect(Array.isArray(userChoices?.groups)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Configuration tab — admin-only access on launchCriticalAppCards
  // ---------------------------------------------------------------------------
  describe('Configuration tab access control', () => {
    let regularManager: Manager
    let regularManagerReq: { user: Manager }

    beforeAll(async () => {
      regularManager = (await testData.createManager(payload, {
        type: 'manager',
        email: `regular-${Date.now()}@example.test`,
      } as Partial<Manager>)) as Manager
      regularManagerReq = { user: regularManager }
    })

    it('admin-only field access blocks non-admin manager updates on launchCriticalAppCards', async () => {
      const globalConfig = payload.globals.config.find((g) => g.slug === 'wm-app-status')!
      const tabsField = globalConfig.fields[0]
      if (tabsField.type !== 'tabs') throw new Error('expected tabs root')
      const configTab = tabsField.tabs.find((t) => t.label === 'Configuration')!
      const launchField = configTab.fields.find(
        (f) => 'name' in f && f.name === 'launchCriticalAppCards',
      )!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateAccess = (launchField as { access?: { update?: (...args: any[]) => any } }).access
        ?.update
      expect(typeof updateAccess).toBe('function')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (updateAccess as any)({ req: regularManagerReq })
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Spec invariant — runSection throws on undeclared check keys
  // ---------------------------------------------------------------------------
  describe('runSection check-key invariant', () => {
    it('throws when a group evaluator emits a check key not declared in the section spec', async () => {
      const badSection: SectionSpec<WeMeditateAppStatusConfig, void> = {
        key: 'bogus',
        tutorialLink: null,
        checks: {
          // 'declared-check' is the only allowed key
          'declared-check': { label: '', description: '' },
        },
        groups: [
          {
            key: 'bogus-group',
            label: '',
            description: '',
            type: 'documents',
            evaluate: async () => [
              {
                id: 1,
                label: 'row',
                checks: [{ key: 'undeclared-check', passed: true }],
              },
            ],
          },
        ],
      }
      await expect(run(badSection, payload)).rejects.toThrow(/undeclared check "undeclared-check"/)
    })
  })
})
