import { sql } from '@payloadcms/db-sqlite'
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import type { Payload } from 'payload'

import { down, up } from '@/migrations/20260409_180000_unify_index_blocks'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Integration test for the migration runner. The pure transform functions are
 * covered by `unify-index-blocks-migration.int.spec.ts`; this file exercises
 * the SQL `up()` / `down()` end-to-end so the column-name mapping for both
 * `pages_locales.content` and `_pages_v_locales.version_content` is verified.
 */

interface DrizzleLike {
  run: (q: unknown) => Promise<unknown>
  all: <T>(q: unknown) => Promise<T[]>
}

function makeOldIndexLexicalDoc(
  blockType: 'meditations-index' | 'pages-index' | 'songs-index',
  filters: unknown,
) {
  return JSON.stringify({
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: 'test-block-id',
            blockName: '',
            blockType,
            filters,
          },
        },
      ],
      direction: null,
    },
  })
}

describe('Unify index blocks migration runner', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let drizzle: DrizzleLike
  let pageId: number

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    drizzle = (payload.db as unknown as { drizzle: DrizzleLike }).drizzle

    // Create a single page so we have valid parent rows in pages_locales and
    // _pages_v_locales. We don't care about the actual content - we'll
    // overwrite it with raw SQL in beforeEach.
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Migration Test Page' },
      draft: true,
    })
    pageId = page.id
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(async () => {
    // Reset both tables to a known old-format state before every test.
    const meditationsDoc = makeOldIndexLexicalDoc('meditations-index', [1, 2, 3])
    const pagesDoc = makeOldIndexLexicalDoc('pages-index', ['wisdom', 'lifestyle'])

    await drizzle.run(
      sql`UPDATE \`pages_locales\` SET \`content\` = ${meditationsDoc} WHERE \`_parent_id\` = ${pageId} AND \`_locale\` = 'en'`,
    )
    await drizzle.run(
      sql`UPDATE \`_pages_v_locales\` SET \`version_content\` = ${pagesDoc} WHERE \`_parent_id\` IN (SELECT \`id\` FROM \`_pages_v\` WHERE \`parent_id\` = ${pageId}) AND \`_locale\` = 'en'`,
    )
  })

  // The migration's MigrateUpArgs/MigrateDownArgs come from db-d1-sqlite, but
  // the test environment uses db-sqlite. Both wrap drizzle's sqlite dialect
  // and expose the same .all/.run shape used by the migration, so we cast.
  const callUp = () =>
    up({ db: drizzle as unknown as MigrateUpArgs['db'] } as MigrateUpArgs)
  const callDown = () =>
    down({ db: drizzle as unknown as MigrateDownArgs['db'] } as MigrateDownArgs)

  async function readPageContent(): Promise<Record<string, unknown>> {
    const rows = await drizzle.all<{ content: string }>(
      sql`SELECT \`content\` FROM \`pages_locales\` WHERE \`_parent_id\` = ${pageId} AND \`_locale\` = 'en'`,
    )
    expect(rows[0]?.content).toBeDefined()
    return JSON.parse(rows[0].content) as Record<string, unknown>
  }

  async function readVersionContent(): Promise<Record<string, unknown>> {
    const rows = await drizzle.all<{ version_content: string }>(
      sql`SELECT \`version_content\` FROM \`_pages_v_locales\` WHERE \`_parent_id\` IN (SELECT \`id\` FROM \`_pages_v\` WHERE \`parent_id\` = ${pageId}) AND \`_locale\` = 'en'`,
    )
    expect(rows[0]?.version_content).toBeDefined()
    return JSON.parse(rows[0].version_content) as Record<string, unknown>
  }

  function firstBlockFields(doc: Record<string, unknown>): Record<string, unknown> {
    const root = doc.root as { children: Array<{ fields: Record<string, unknown> }> }
    return root.children[0].fields
  }

  describe('up()', () => {
    it('migrates pages_locales.content from meditations-index to content-index', async () => {
      await callUp()
      const fields = firstBlockFields(await readPageContent())
      expect(fields.blockType).toBe('content-index')
      expect(fields.type).toBe('meditations')
      expect(fields.meditationFilters).toEqual([1, 2, 3])
      expect(fields.filters).toBeUndefined()
    })

    it('migrates _pages_v_locales.version_content from pages-index to content-index', async () => {
      await callUp()
      const fields = firstBlockFields(await readVersionContent())
      expect(fields.blockType).toBe('content-index')
      expect(fields.type).toBe('pages')
      expect(fields.pageFilters).toEqual(['wisdom', 'lifestyle'])
      expect(fields.filters).toBeUndefined()
    })
  })

  describe('down()', () => {
    it('reverts both tables back to their original old-format blocks', async () => {
      await callUp()
      await callDown()

      const pageFields = firstBlockFields(await readPageContent())
      expect(pageFields.blockType).toBe('meditations-index')
      expect(pageFields.filters).toEqual([1, 2, 3])
      expect(pageFields.type).toBeUndefined()
      expect(pageFields.meditationFilters).toBeUndefined()

      const versionFields = firstBlockFields(await readVersionContent())
      expect(versionFields.blockType).toBe('pages-index')
      expect(versionFields.filters).toEqual(['wisdom', 'lifestyle'])
      expect(versionFields.type).toBeUndefined()
      expect(versionFields.pageFilters).toBeUndefined()
    })
  })
})
