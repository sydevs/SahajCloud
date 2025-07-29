import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Tag, Media, Meditation, Music, Narrator } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testDataFactory } from '../utils/testDataFactory'

describe('Localization', () => {
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

  describe('Tags Collection', () => {
    it('creates and retrieves localized tag titles', async () => {
      // Create tag with English title
      const enTag = await payload.create({
        collection: 'tags',
        data: {
          title: 'Mindfulness',
        },
        locale: 'en',
      }) as Tag

      // Update tag with Italian title
      await payload.update({
        collection: 'tags',
        id: enTag.id,
        data: {
          title: 'Consapevolezza',
        },
        locale: 'it',
      })

      // Retrieve English version
      const enResult = await payload.findByID({
        collection: 'tags',
        id: enTag.id,
        locale: 'en',
      }) as Tag

      expect(enResult.title).toBe('Mindfulness')

      // Retrieve Italian version
      const itResult = await payload.findByID({
        collection: 'tags',
        id: enTag.id,
        locale: 'it',
      }) as Tag

      expect(itResult.title).toBe('Consapevolezza')
    })

    it('supports localized queries with find operations', async () => {
      // Create tag with different titles for each locale
      const tag = await payload.create({
        collection: 'tags',
        data: {
          title: 'Relaxation',
        },
        locale: 'en',
      }) as Tag

      await payload.update({
        collection: 'tags',
        id: tag.id,
        data: {
          title: 'Rilassamento',
        },
        locale: 'it',
      })

      // Query with English locale
      const enResults = await payload.find({
        collection: 'tags',
        where: {
          title: {
            equals: 'Relaxation',
          },
        },
        locale: 'en',
      })

      expect(enResults.docs.length).toBeGreaterThan(0)
      expect(enResults.docs[0].title).toBe('Relaxation')

      // Query with Italian locale
      const itResults = await payload.find({
        collection: 'tags',
        where: {
          title: {
            equals: 'Rilassamento',
          },
        },
        locale: 'it',
      })

      expect(itResults.docs.length).toBeGreaterThan(0)
      expect(itResults.docs[0].title).toBe('Rilassamento')
    })
  })

  describe('Media Collection', () => {
    it('creates and retrieves localized media fields', async () => {
      // Create media with English fields
      const media = await payload.create({
        collection: 'media',
        data: {
          alt: 'Test Image',
          credit: 'Test Photographer',
        },
        file: {
          data: Buffer.from('fake image data'),
          mimetype: 'image/jpeg',
          name: 'test.jpg',
          size: 100,
        },
        locale: 'en',
      }) as Media

      // Update with Italian fields
      await payload.update({
        collection: 'media',
        id: media.id,
        data: {
          alt: 'Immagine di Prova',
          credit: 'Fotografo di Prova',
        },
        locale: 'it',
      })

      // Retrieve English version
      const enResult = await payload.findByID({
        collection: 'media',
        id: media.id,
        locale: 'en',
      }) as Media

      expect(enResult.alt).toBe('Test Image')
      expect(enResult.credit).toBe('Test Photographer')

      // Retrieve Italian version
      const itResult = await payload.findByID({
        collection: 'media',
        id: media.id,
        locale: 'it',
      }) as Media

      expect(itResult.alt).toBe('Immagine di Prova')
      expect(itResult.credit).toBe('Fotografo di Prova')
    })
  })

  describe('Music Collection', () => {
    it('creates and retrieves localized music fields', async () => {
      // Create music with English fields
      const music = await testDataFactory.createMusic(payload, {
        title: 'Peaceful Morning',
        credit: 'Music Studio',
      })

      // Update with Italian fields
      await payload.update({
        collection: 'music',
        id: music.id,
        data: {
          title: 'Mattino Tranquillo',
          credit: 'Studio Musicale',
        },
        locale: 'it',
      })

      // Retrieve English version
      const enResult = await payload.findByID({
        collection: 'music',
        id: music.id,
        locale: 'en',
      }) as Music

      expect(enResult.title).toBe('Peaceful Morning')
      expect(enResult.credit).toBe('Music Studio')

      // Retrieve Italian version  
      const itResult = await payload.findByID({
        collection: 'music',
        id: music.id,
        locale: 'it',
      }) as Music

      expect(itResult.title).toBe('Mattino Tranquillo')
      expect(itResult.credit).toBe('Studio Musicale')
    })
  })

  describe('Meditations Collection', () => {
    let narrator: Narrator
    let thumbnail: Media

    beforeAll(async () => {
      // Create shared test data
      narrator = await testDataFactory.createNarrator(payload, {
        name: 'Test Narrator for Localization',
      })
      thumbnail = await testDataFactory.createMediaImage(payload, {
        alt: 'Test Thumbnail',
      })
    })

    it('creates meditation with locale select field', async () => {
      const meditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'English Meditation',
        locale: 'en',
      })

      expect(meditation).toBeDefined()
      expect(meditation.locale).toBe('en')
      expect(meditation.title).toBe('English Meditation')
    })

    it('filters meditations by locale in find operations', async () => {
      // Create English meditation
      const enMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'English Meditation for Filter Test',
        locale: 'en',
      })

      // Create Italian meditation  
      const itMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'Italian Meditation for Filter Test',
        locale: 'it',
      })

      // Find English meditations
      const enResult = await payload.find({
        collection: 'meditations',
        where: {
          locale: {
            equals: 'en',
          },
        },
      })

      const enIds = enResult.docs.map(doc => doc.id)
      expect(enIds).toContain(enMeditation.id)
      expect(enIds).not.toContain(itMeditation.id)

      // Find Italian meditations
      const itResult = await payload.find({
        collection: 'meditations',
        where: {
          locale: {
            equals: 'it',
          },
        },
      })

      const itIds = itResult.docs.map(doc => doc.id)
      expect(itIds).toContain(itMeditation.id)
      expect(itIds).not.toContain(enMeditation.id)
    })

    it('filters meditations by locale using query parameter', async () => {
      // Create meditations in different locales
      const enMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'Query Param Test English',
        locale: 'en',
      })

      const itMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'Query Param Test Italian',
        locale: 'it',
      })

      // Simulate API request with locale query parameter
      const enApiResult = await payload.find({
        collection: 'meditations',
        req: { 
          query: { locale: 'en' },
          locale: undefined // Ensure req.locale is not set
        } as any,
      })

      const enApiIds = enApiResult.docs.map(doc => doc.id)
      expect(enApiIds).toContain(enMeditation.id)
      expect(enApiIds).not.toContain(itMeditation.id)

      // Simulate API request with Italian locale query parameter
      const itApiResult = await payload.find({
        collection: 'meditations',
        req: { 
          query: { locale: 'it' },
          locale: undefined // Ensure req.locale is not set
        } as any,
      })

      const itApiIds = itApiResult.docs.map(doc => doc.id)
      expect(itApiIds).toContain(itMeditation.id)
      expect(itApiIds).not.toContain(enMeditation.id)
    })

    it('filters meditations by locale in count operations', async () => {
      // Create multiple meditations
      for (let i = 0; i < 3; i++) {
        await testDataFactory.createMeditation(payload, {
          narrator: narrator.id,
          thumbnail: thumbnail.id,
        }, {
          title: `Count Test English ${i}`,
          locale: 'en',
        })
      }

      for (let i = 0; i < 2; i++) {
        await testDataFactory.createMeditation(payload, {
          narrator: narrator.id,
          thumbnail: thumbnail.id,
        }, {
          title: `Count Test Italian ${i}`,
          locale: 'it',
        })
      }

      // Count by locale using where clause
      const enCount = await payload.count({
        collection: 'meditations',
        where: {
          locale: {
            equals: 'en',
          },
        },
      })

      const itCount = await payload.count({
        collection: 'meditations',
        where: {
          locale: {
            equals: 'it',
          },
        },
      })

      expect(enCount.totalDocs).toBeGreaterThanOrEqual(3)
      expect(itCount.totalDocs).toBeGreaterThanOrEqual(2)
    })

    it('validates locale field values', async () => {
      // Try to create with invalid locale
      await expect(
        payload.create({
          collection: 'meditations',
          data: {
            title: 'Invalid Locale Meditation',
            locale: 'fr', // Not a valid option
            narrator: narrator.id,
            thumbnail: thumbnail.id,
            duration: 15,
          },
        })
      ).rejects.toThrow()
    })

    it('defaults to en locale when not specified', async () => {
      const meditation = await payload.create({
        collection: 'meditations',
        data: {
          title: 'Default Locale Meditation',
          // locale not specified
          narrator: narrator.id,
          thumbnail: thumbnail.id,
          duration: 15,
        },
      }) as Meditation

      expect(meditation.locale).toBe('en')
    })

    it('uses req.locale for filtering when no query locale specified', async () => {
      // Create test meditations
      const enMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'Req Locale Test English',
        locale: 'en',
      })

      const itMeditation = await testDataFactory.createMeditation(payload, {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      }, {
        title: 'Req Locale Test Italian',
        locale: 'it',
      })

      // Test with req.locale set to 'en'
      const enReqResult = await payload.find({
        collection: 'meditations',
        req: { 
          locale: 'en',
          query: {} // No query locale
        } as any,
      })

      const enReqIds = enReqResult.docs.map(doc => doc.id)
      expect(enReqIds).toContain(enMeditation.id)
      expect(enReqIds).not.toContain(itMeditation.id)

      // Test with req.locale set to 'it'
      const itReqResult = await payload.find({
        collection: 'meditations',
        req: { 
          locale: 'it',
          query: {} // No query locale
        } as any,
      })

      const itReqIds = itReqResult.docs.map(doc => doc.id)
      expect(itReqIds).toContain(itMeditation.id)
      expect(itReqIds).not.toContain(enMeditation.id)
    })
  })

  describe('Default locale behavior', () => {
    it('returns default locale content when no locale is specified', async () => {
      // Create tag with both locales
      const tag = await payload.create({
        collection: 'tags',
        data: {
          title: 'Default English',
        },
        locale: 'en',
      }) as Tag

      await payload.update({
        collection: 'tags',
        id: tag.id,
        data: {
          title: 'Default Italian',
        },
        locale: 'it',
      })

      // Query without locale should return default (en)
      const defaultResult = await payload.findByID({
        collection: 'tags',
        id: tag.id,
        // No locale specified
      }) as Tag

      expect(defaultResult.title).toBe('Default English')
    })
  })
})