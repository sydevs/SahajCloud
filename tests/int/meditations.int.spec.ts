import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type {
  Meditation,
  MeditationsSelect,
  Narrator,
  Image,
  SongTag,
  Album,
} from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Meditations Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Image
  let testSongTag: SongTag
  let testMeditation: Meditation
  let testAlbum: Album

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testData.createNarrator(payload)
    testImageMedia = await testData.createMediaImage(payload)
    testSongTag = await testData.createSongTag(payload)
    testAlbum = await testData.createAlbum(payload)

    // Create test meditation
    testMeditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Morning Meditation',
        songTag: testSongTag.id,
      },
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a meditation with audio upload and relationships', async () => {
    expect(testMeditation).toBeDefined()
    expect(testMeditation.label).toBe('Morning Meditation')
    expect(testMeditation.filename).toBeDefined() // Now has direct audio upload
    expect(
      typeof testMeditation.narrator === 'object'
        ? testMeditation.narrator.id
        : testMeditation.narrator,
    ).toBe(testNarrator.id)
    expect(
      typeof testMeditation.songTag === 'object' && testMeditation.songTag
        ? testMeditation.songTag.id
        : testMeditation.songTag,
    ).toBe(testSongTag.id)
  })

  it('creates meditation as draft by default', async () => {
    const meditation = await testData.createMeditation(
      payload,
      {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      },
      {
        title: 'Draft Meditation',
      },
    )

    expect(meditation._status).toBe('draft')
  })

  it('creates meditation with audio file', async () => {
    const meditation = await testData.createMeditation(payload, {
      narrator: testNarrator.id,
      thumbnail: testImageMedia.id,
    })

    expect(meditation).toBeDefined()
    expect(meditation.filename).toBeDefined()
  })

  describe('Songs includeForMeditations auto-set', () => {
    it('auto-sets includeForMeditations to false on creation when song has vocals tag', async () => {
      // Create a song tag with the 'vocals' slug
      const vocalsTag = await testData.createSongTag(payload, {
        title: 'Vocals',
        slug: 'vocals',
      })

      const song = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [vocalsTag.id],
      })

      const fetched = await payload.findByID({
        collection: 'songs',
        id: song.id,
      })
      expect(fetched.includeForMeditations).toBe(false)
    })

    it('does not change includeForMeditations after creation when tags change', async () => {
      const vocalsTag = await payload.find({
        collection: 'song-tags',
        where: { slug: { equals: 'vocals' } },
        limit: 1,
      })

      // The vocals tag should exist from the previous test
      const vocalsId = vocalsTag.docs[0]?.id
      expect(vocalsId).toBeDefined()

      const otherTag = await testData.createSongTag(payload, { title: 'Other Tag' })

      // Song created with vocals → auto-set to false
      const vocalSong = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [vocalsId!, otherTag.id],
      })
      let fetched = await payload.findByID({ collection: 'songs', id: vocalSong.id })
      expect(fetched.includeForMeditations).toBe(false)

      // Removing the vocals tag must NOT flip it back to true (manual control only)
      await payload.update({
        collection: 'songs',
        id: vocalSong.id,
        data: { tags: [otherTag.id] },
      })
      fetched = await payload.findByID({ collection: 'songs', id: vocalSong.id })
      expect(fetched.includeForMeditations).toBe(false)

      // Song created without vocals → default to true
      const instrumentalSong = await testData.createSong(payload, {
        album: testAlbum.id,
        tags: [otherTag.id],
      })
      fetched = await payload.findByID({ collection: 'songs', id: instrumentalSong.id })
      expect(fetched.includeForMeditations).toBe(true)

      // Adding the vocals tag later must NOT flip it to false (manual control only)
      await payload.update({
        collection: 'songs',
        id: instrumentalSong.id,
        data: { tags: [vocalsId!, otherTag.id] },
      })
      fetched = await payload.findByID({ collection: 'songs', id: instrumentalSong.id })
      expect(fetched.includeForMeditations).toBe(true)
    })
  })

  describe('Locale filtering', () => {
    let enMeditation1: Meditation
    let enMeditation2: Meditation
    let csMeditation: Meditation
    let deMeditation: Meditation

    beforeAll(async () => {
      // Create meditations in different locales. `title` is virtual now, so
      // these use `label` (the stored, queryable identifier).
      enMeditation1 = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'English Meditation 1', locale: 'en' },
      )
      enMeditation2 = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'English Meditation 2', locale: 'en' },
      )
      csMeditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'Czech Meditation', locale: 'cs' },
      )
      deMeditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'German Meditation', locale: 'de' },
      )
    })

    it('filters meditations by English locale', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'en',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(enMeditation1.id)
      expect(ids).toContain(enMeditation2.id)
      expect(ids).not.toContain(csMeditation.id)
      expect(ids).not.toContain(deMeditation.id)
      // All returned docs should have locale 'en'
      expect(result.docs.every((doc) => doc.locale === 'en')).toBe(true)
    })

    it('filters meditations by Czech locale', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'cs',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(csMeditation.id)
      expect(ids).not.toContain(enMeditation1.id)
      expect(ids).not.toContain(deMeditation.id)
      expect(result.docs.every((doc) => doc.locale === 'cs')).toBe(true)
    })

    it('returns all meditations when locale is all', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'all',
        draft: true,
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(enMeditation1.id)
      expect(ids).toContain(csMeditation.id)
      expect(ids).toContain(deMeditation.id)
    })

    it('returns specific meditation by ID regardless of locale mismatch', async () => {
      // Query a German meditation with locale set to English
      const result = await payload.findByID({
        collection: 'meditations',
        id: deMeditation.id,
        locale: 'en',
        draft: true,
      })

      expect(result).toBeDefined()
      expect(result.id).toBe(deMeditation.id)
      expect(result.locale).toBe('de')
    })

    it('count respects locale filtering', async () => {
      const enCount = await payload.count({
        collection: 'meditations',
        locale: 'en',
      })
      const csCount = await payload.count({
        collection: 'meditations',
        locale: 'cs',
      })
      const allCount = await payload.count({
        collection: 'meditations',
        // Payload's cross-locale read. The generated union lists configured
        // locales only, so it does not include this.
        locale: 'all' as Parameters<typeof payload.count>[0]['locale'],
      })

      expect(csCount.totalDocs).toBe(1)
      expect(enCount.totalDocs).toBeGreaterThan(csCount.totalDocs)
      expect(allCount.totalDocs).toBeGreaterThanOrEqual(enCount.totalDocs + csCount.totalDocs)
    })

    it('preserves existing where clauses alongside locale filter', async () => {
      const result = await payload.find({
        collection: 'meditations',
        locale: 'en',
        draft: true,
        depth: 0,
        where: {
          label: { equals: 'English Meditation 1' },
        },
      })

      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(enMeditation1.id)
    })

    it('defaults to English locale when no locale specified', async () => {
      // PayloadCMS defaults req.locale to 'en' when not specified
      const result = await payload.find({
        collection: 'meditations',
        draft: true,
        depth: 0,
      })

      // Should only contain English meditations
      expect(result.docs.every((doc) => doc.locale === 'en')).toBe(true)
      expect(result.docs.map((doc) => doc.id)).not.toContain(csMeditation.id)
      expect(result.docs.map((doc) => doc.id)).not.toContain(deMeditation.id)
    })

    it('filters a find that leaves `draft` to Payload', async () => {
      // The guard's FALSE branch, and the only case here that pins it. Every
      // other case in this block passes `draft: true` by hand, which makes
      // `'draft' in args` true whatever Payload does — but the argument the
      // guard reads is the one Payload's own `find` supplies. If an upgrade
      // stopped supplying it, locale filtering would switch off silently for
      // ordinary reads, and only this case would notice.
      //
      // Published fixtures, because a `find` without `draft` sees published
      // documents only, and the four above are drafts. Both halves matter: the
      // German one must be excluded BY THE FILTER, not by being a draft.
      const publishedCs = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'Published Czech Meditation', locale: 'cs', _status: 'published' },
      )
      const publishedDe = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { label: 'Published German Meditation', locale: 'de', _status: 'published' },
      )

      const result = await payload.find({ collection: 'meditations', locale: 'cs', depth: 0 })
      const ids = result.docs.map((doc) => doc.id)

      expect(ids).toContain(publishedCs.id)
      expect(ids).not.toContain(publishedDe.id)
    })

    /**
     * The hook must decline a `findVersions`: `locale` is not a queryable path
     * on the versions collection, so appending the filter 400s every caller
     * (#745 — see `src/lib/utilities/versionsRead.ts`). Deleting the guard from
     * the hook turns every case below red with "path cannot be queried".
     * `findVersionByID` never reached that 400 — it carries an `id`, which the
     * hook already skipped.
     *
     * Fixture assumption, checked rather than assumed: meditations enables
     * `versions.drafts` (`src/collections/Meditations/Meditations.ts`), so each
     * document above already has a version row. Every case asserts a non-zero
     * count, so a fixture that stopped producing rows fails loudly instead of
     * passing vacuously.
     */
    describe('Versions reads (#745)', () => {
      it('resolves for a manager with the access gate on', async () => {
        // AC 1 of #745, and the shape the bug was reported on: the admin
        // version-history tab, which reads as its logged-in manager. The two
        // cases below pass `overrideAccess: true`, so they pin query validation
        // while skipping `readVersions` entirely.
        //
        // `meditations-editor` grants meditations `update`, which
        // `withDerivedGrants` derives `readVersions` from
        // (`src/plugins/access/accessConfigs.ts`). That grant is unconditional,
        // so this case does NOT pin the `Where` translation beside it —
        // verified by disabling it and watching this stay green.
        // `role-based-access.int.spec.ts` pins the translation, on `pages`.
        const editor = await testData.createManager(payload, {
          name: 'Meditations Editor for Version History Test',
          roles: { en: ['meditations-editor'] },
        })

        const versions = await payload.findVersions({
          collection: 'meditations',
          locale: 'en',
          where: { parent: { equals: enMeditation1.id } },
          depth: 0,
          user: editor,
          overrideAccess: false,
        })

        expect(versions.totalDocs).toBeGreaterThan(0)
        expect(versions.docs.every((row) => Number(row.parent) === enMeditation1.id)).toBe(true)

        // The gate is genuinely running, not skipped: a manager with no
        // meditations grant is refused the same read. Without this, a
        // `readVersions` that had stopped being consulted would look identical.
        const outsider = await testData.createManager(payload, {
          name: 'Path Editor for Version History Test',
          roles: { en: ['path-editor'] },
        })

        await expect(
          payload.findVersions({
            collection: 'meditations',
            locale: 'en',
            where: { parent: { equals: enMeditation1.id } },
            depth: 0,
            user: outsider,
            overrideAccess: false,
          }),
        ).rejects.toThrow('You are not allowed to perform this action.')
      })

      it('resolves a single-locale versions read', async () => {
        const versions = await payload.findVersions({
          collection: 'meditations',
          locale: 'en',
          where: { parent: { equals: enMeditation1.id } },
          depth: 0,
          overrideAccess: true,
        })

        expect(versions.totalDocs).toBeGreaterThan(0)
        expect(versions.docs.every((row) => Number(row.parent) === enMeditation1.id)).toBe(true)
      })

      it('does not scope a versions read to the request locale', async () => {
        // The other half of the same guard: the hook must decline the versions
        // read, not translate its filter. A German meditation's versions stay
        // reachable from an English request, the way `findByID` already is.
        const versions = await payload.findVersions({
          collection: 'meditations',
          locale: 'en',
          where: { parent: { equals: deMeditation.id } },
          depth: 0,
          overrideAccess: true,
        })

        expect(versions.totalDocs).toBeGreaterThan(0)
      })
    })
  })

  describe('Type field', () => {
    it('creates meditation with daily type by default', async () => {
      const meditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      expect(meditation.type).toBe('daily')
    })

    it('creates meditation with lesson type', async () => {
      const meditation = await testData.createMeditation(
        payload,
        { narrator: testNarrator.id, thumbnail: testImageMedia.id },
        { type: 'lesson' },
      )

      expect(meditation.type).toBe('lesson')
    })
  })

  describe('Public title (virtual fallback)', () => {
    it('returns null when the meditation has no node weights', async () => {
      // testMeditation has no frames, so subtleSystemNodeWeights is empty.
      const med = await payload.findByID({
        collection: 'meditations',
        id: testMeditation.id,
        locale: 'en',
      })

      expect(med.title).toBeNull()
    })

    it('returns "Meditation for <dominant node>" from cached node weights', async () => {
      // A single pingala frame makes pingala the dominant (only) node. Pingala
      // maps to the "Right Channel" label via SUBTLE_SYSTEM_NODE_OPTIONS.
      const node = await testData.createSubtleSystemNode(payload, {}, { slug: 'pingala' })
      const frame = await testData.createFrame(payload, { subtleSystemNode: node.id })

      const created = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      // Updating frames fires recomputeMeditationNodeWeights, which writes the
      // { pingala → seconds } weights cache to the main meditations row (via
      // db.updateOne). The title hook reads that cache on the next read.
      await payload.update({
        collection: 'meditations',
        id: created.id,
        data: {
          frames: [{ id: frame.id, timestamp: 0 }] as unknown as Meditation['frames'],
        },
        locale: 'en',
      })

      const med = await payload.findByID({
        collection: 'meditations',
        id: created.id,
        locale: 'en',
      })

      expect(med.title).toBe('Meditation for Right Channel')
    })
  })

  describe('Admin list view select (#459)', () => {
    // Mirrors the field `select` the admin list view builds when
    // `enableListViewSelectAPI` is on: transformColumnsToSelect(defaultColumns)
    // — label, thumbnail, _status, type, durationMinutes, duration — plus the
    // upload thumbnail fields appended by appendUploadSelectFields. Replicated
    // here because the select is assembled in @payloadcms/next's RSC List view,
    // which an integration test cannot invoke directly.
    const LIST_VIEW_SELECT: MeditationsSelect<true> = {
      label: true,
      thumbnail: true,
      _status: true,
      type: true,
      durationMinutes: true,
      duration: true,
      mimeType: true,
      thumbnailURL: true,
      url: true,
    }

    let listMeditation: Meditation

    beforeAll(async () => {
      // Give every expensive hook real work to do, so skipping it is
      // observable: a frame (frames enrichment) and a category referencing
      // this meditation (tagAssignments join).
      const frame = await testData.createFrame(payload)

      listMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })
      await payload.update({
        collection: 'meditations',
        id: listMeditation.id,
        data: { frames: [{ id: frame.id, timestamp: 0 }] as unknown as Meditation['frames'] },
      })
      await testData.createUserChoice(payload, {
        morningMeditation: listMeditation.id,
      } as Parameters<typeof testData.createUserChoice>[1])
    })

    // The find the admin list view issues for this meditation (restricted to
    // its active columns, like the real list).
    const fetchListView = () =>
      payload.find({
        collection: 'meditations',
        where: { id: { equals: listMeditation.id } },
        depth: 0,
        draft: true,
        locale: 'en',
        select: LIST_VIEW_SELECT,
      })

    it('skips the expensive per-row afterRead hooks on a list-style find', async () => {
      const findSpy = vi.spyOn(payload, 'find')
      try {
        const result = await fetchListView()

        const findCollections = findSpy.mock.calls.map((c) => c[0].collection)

        // None of the hook-driven sub-queries fire: tagAssignments
        // (user-choices) and frames enrichment (frames).
        expect(findCollections).not.toContain('user-choices')
        expect(findCollections).not.toContain('frames')

        // ...and the unselected fields are stripped from the row entirely.
        const doc = result.docs[0]
        expect(doc.frames).toBeUndefined()
        expect(doc.tagAssignments).toBeUndefined()
      } finally {
        findSpy.mockRestore()
      }
    })

    it('still renders the durationMinutes column (duration stays selected)', async () => {
      // audio-42s.mp3 → duration ~42s → ceil(42 / 60) = 1 minute. This only
      // works because `duration` is in the list select. Drop it from
      // defaultColumns and the virtual column blanks.
      const result = await fetchListView()
      const doc = result.docs[0]
      expect(doc.label).toBeTruthy()
      expect(doc.durationMinutes).toBe(1)
    })

    it('leaves a full read (REST / edit view) unchanged — all fields present', async () => {
      // A read without the list select still computes every field, so the public
      // REST API and the admin edit view are unaffected by the list-only flags.
      const result = await payload.find({
        collection: 'meditations',
        where: { id: { equals: listMeditation.id } },
        depth: 0,
        draft: true,
        locale: 'en',
      })
      const doc = result.docs[0]
      expect(Array.isArray(doc.frames)).toBe(true)
      expect((doc.frames as unknown[]).length).toBeGreaterThan(0)

      const tagAssignments = doc.tagAssignments as { asMorningMeditation?: unknown[] } | undefined
      expect(tagAssignments?.asMorningMeditation).toHaveLength(1)
    })
  })

  describe('defaultPopulate on relationship hydration (#529)', () => {
    let relMeditationId: number
    let userChoiceId: number

    beforeAll(async () => {
      // Frame + tag-assignment give the excluded afterRead fields real work, so
      // their absence on a populated read is meaningful (not just empty data).
      const frame = await testData.createFrame(payload)
      const relMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })
      relMeditationId = relMeditation.id
      await payload.update({
        collection: 'meditations',
        id: relMeditationId,
        data: { frames: [{ id: frame.id, timestamp: 0 }] as unknown as Meditation['frames'] },
      })
      const userChoice = await testData.createUserChoice(payload, {
        morningMeditation: relMeditationId,
      } as Parameters<typeof testData.createUserChoice>[1])
      userChoiceId = userChoice.id
    })

    it('omits frames + tagAssignments when a meditation is populated through a relationship', async () => {
      const findSpy = vi.spyOn(payload, 'find')
      try {
        const userChoice = await payload.findByID({
          collection: 'user-choices',
          id: userChoiceId,
          depth: 1,
          locale: 'en',
        })

        const populated = userChoice.morningMeditation as Meditation
        expect(typeof populated).toBe('object')

        // defaultPopulate excludes these, so neither expensive per-row afterRead
        // runs and the fields are absent from the hydrated relationship.
        expect(populated.frames).toBeUndefined()
        expect(populated.tagAssignments).toBeUndefined()
        expect(findSpy.mock.calls.map((call) => call[0].collection)).not.toContain('frames')

        // A non-excluded field still hydrates normally.
        expect(populated.label).toBeTruthy()
      } finally {
        findSpy.mockRestore()
      }
    })
  })
})
