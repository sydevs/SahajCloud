import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import type { File, Lecture, Meditation, WmAppConfig } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client — prevents real network calls when creating lectures
vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(
    join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'),
  )
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
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

describe('WeMeditateAppConfig Global', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Shared test entities
  let meditation: Meditation
  let lecture: Lecture
  let audioFile: File
  let vttFile: File
  // Every page relationship in the "Pages" tab is `required`, and so is
  // `availableLocales` (#709), so updateGlobal rejects unless all of them are
  // present. Build the page set from the source list (one shared placeholder
  // page) so it never drifts as pages are added.
  //
  // `['en']` needs no `skipAvailableLocalesCheck`: the field returns early once
  // the gated set — every locale but English — is empty, above the publish
  // check that needs stored data (`src/fields/availableLocalesField.ts`).
  let requiredConfig: Record<string, unknown>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create shared test entities
    meditation = await testData.createMeditation(payload)
    // postRealizationLecture references `lectures` after the merge (#330).
    lecture = await testData.createLecture(payload)
    audioFile = await testData.createFile(payload, {}, 'audio-42s.mp3')
    vttFile = await testData.createFile(payload, {}, 'subtitles.vtt')

    const placeholderPage = await testData.createPage(payload, {
      title: 'Required Page Placeholder',
    })
    requiredConfig = {
      ...Object.fromEntries(APP_REQUIRED_PAGE_FIELDS.map((name) => [name, placeholderPage.id])),
      availableLocales: ['en'],
    }
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('field structure', () => {
    it('has Pages, First Meditation, and Misc tabs with the expected fields', () => {
      const globalConfig = payload.globals.config.find((g) => g.slug === 'wm-app-config')
      expect(globalConfig).toBeDefined()

      // `availableLocales` sits above the tabs (#709), so find the tabs field
      // rather than indexing it — this assertion used to read `fields[0]`.
      const topLevel = globalConfig!.fields
      expect(topLevel.map((f) => ('name' in f ? f.name : f.type))).toContain('availableLocales')

      // `!` rather than a `toBeDefined()` beside it: if no tabs field is found,
      // reading `.type` below throws and fails this case loudly anyway.
      const tabsField = topLevel.find((f) => f.type === 'tabs')!

      if (tabsField.type === 'tabs') {
        expect(tabsField.tabs).toHaveLength(3)
        const tabLabels = tabsField.tabs.map((t) => t.label)
        expect(tabLabels).toContain('Pages')
        expect(tabLabels).toContain('First Meditation')
        expect(tabLabels).toContain('Misc')

        // All required page relationships live in the single "Pages" tab.
        const pagesTab = tabsField.tabs.find((t) => t.label === 'Pages')!
        const pageFieldNames = pagesTab.fields.map((f) => ('name' in f ? f.name : undefined))
        expect(pageFieldNames).toHaveLength(APP_REQUIRED_PAGE_FIELDS.length)
        expect(pageFieldNames).toEqual(expect.arrayContaining([...APP_REQUIRED_PAGE_FIELDS]))

        const firstMeditationTab = tabsField.tabs.find((t) => t.label === 'First Meditation')!
        const fieldNames = firstMeditationTab.fields.map((f) => ('name' in f ? f.name : undefined))
        expect(fieldNames).toContain('selfRealizationMeditation')
        expect(fieldNames).toContain('postRealizationLecture')
        expect(fieldNames).toContain('vibeCheckTracks')
      }
    })
  })

  describe('selfRealizationMeditation', () => {
    it('can be set and retrieved', async () => {
      await payload.updateGlobal({
        slug: 'wm-app-config',
        data: { selfRealizationMeditation: meditation.id, ...requiredConfig },
      })

      const config = (await payload.findGlobal({
        slug: 'wm-app-config',
        depth: 0,
      })) as WmAppConfig
      expect(config.selfRealizationMeditation).toBe(meditation.id)
    })
  })

  describe('postRealizationLecture', () => {
    it('can be set and resolves correctly', async () => {
      await payload.updateGlobal({
        slug: 'wm-app-config',
        data: { postRealizationLecture: lecture.id, ...requiredConfig },
      })

      const config = (await payload.findGlobal({
        slug: 'wm-app-config',
        depth: 1,
      })) as WmAppConfig
      const populated = config.postRealizationLecture as Lecture
      expect(populated.id).toBe(lecture.id)
      expect(populated.nirmalVidyaVimeoUrl).toBeDefined()
    })
  })

  describe('vibeCheckTracks', () => {
    it('accepts array items with identifier, audio, and subtitles', async () => {
      await payload.updateGlobal({
        slug: 'wm-app-config',
        data: {
          ...requiredConfig,
          vibeCheckTracks: [
            {
              identifier: 'BH-COOL',
              audio: audioFile.id,
              subtitles: vttFile.id,
            },
            {
              identifier: 'SOMETHING-COOL',
              audio: audioFile.id,
              subtitles: vttFile.id,
            },
          ],
        },
      })

      const config = (await payload.findGlobal({
        slug: 'wm-app-config',
        depth: 0,
      })) as WmAppConfig
      expect(config.vibeCheckTracks).toHaveLength(2)
      expect(config.vibeCheckTracks![0].identifier).toBe('BH-COOL')
      expect(config.vibeCheckTracks![0].audio).toBe(audioFile.id)
      expect(config.vibeCheckTracks![0].subtitles).toBe(vttFile.id)
      expect(config.vibeCheckTracks![1].identifier).toBe('SOMETHING-COOL')
    })
  })

  describe('localization', () => {
    let enMeditation: Meditation
    let csMeditation: Meditation
    let enLecture: Lecture
    let csLecture: Lecture

    beforeAll(async () => {
      enMeditation = await testData.createMeditation(payload, undefined, { locale: 'en' })
      csMeditation = await testData.createMeditation(payload, undefined, { locale: 'cs' })
      enLecture = await testData.createLecture(payload, undefined, { title: 'English Lecture' })
      csLecture = await testData.createLecture(payload, undefined, { title: 'Czech Lecture' })
    })

    it('stores different values per locale for all fields', async () => {
      // Set English values
      await payload.updateGlobal({
        slug: 'wm-app-config',
        locale: 'en',
        data: {
          ...requiredConfig,
          selfRealizationMeditation: enMeditation.id,
          postRealizationLecture: enLecture.id,
          vibeCheckTracks: [
            { identifier: 'WHAT-YOU-FEEL-START', audio: audioFile.id, subtitles: vttFile.id },
          ],
        },
      })

      // Set Czech values
      await payload.updateGlobal({
        slug: 'wm-app-config',
        locale: 'cs',
        data: {
          ...requiredConfig,
          selfRealizationMeditation: csMeditation.id,
          postRealizationLecture: csLecture.id,
          vibeCheckTracks: [
            { identifier: 'BH-NOTHING', audio: audioFile.id, subtitles: vttFile.id },
          ],
        },
      })

      // Verify English
      const enConfig = (await payload.findGlobal({
        slug: 'wm-app-config',
        locale: 'en',
        depth: 0,
      })) as WmAppConfig
      expect(enConfig.selfRealizationMeditation).toBe(enMeditation.id)
      expect(enConfig.postRealizationLecture).toBe(enLecture.id)
      expect(enConfig.vibeCheckTracks).toHaveLength(1)
      expect(enConfig.vibeCheckTracks![0].identifier).toBe('WHAT-YOU-FEEL-START')

      // Verify Czech
      const csConfig = (await payload.findGlobal({
        slug: 'wm-app-config',
        locale: 'cs',
        depth: 0,
        fallbackLocale: false,
      })) as WmAppConfig
      expect(csConfig.selfRealizationMeditation).toBe(csMeditation.id)
      expect(csConfig.postRealizationLecture).toBe(csLecture.id)
      expect(csConfig.vibeCheckTracks).toHaveLength(1)
      expect(csConfig.vibeCheckTracks![0].identifier).toBe('BH-NOTHING')
    })
  })
})
