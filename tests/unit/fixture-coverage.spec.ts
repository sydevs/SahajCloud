import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FIXTURES } from '@/fixture'
import { fixtureGaps } from '@/fixture/coverage'
import { FIXTURE_FILES_DIR } from '@/fixture/load'
import { fixtureOrder } from '@/fixture/order'
import { VIEWS } from '@/fixture/views'
import config from '@/payload.config'

const SRC = path.resolve(__dirname, '../../src')

/** The config import alone exceeds vitest's 5 s default. */
const TIMEOUT = 60_000

/** Every component path `importMap.js` registers from this repo's own `src/`. */
async function customComponents(): Promise<string[]> {
  const text = await fs.readFile(`${SRC}/app/(payload)/admin/importMap.js`, 'utf8')
  return [...text.matchAll(/^ {2}"(@\/[^"]+)"/gm)].map((m) => m[1])
}

/**
 * The preview fixture's coverage guard (#1168): every collection, lifecycle
 * state, select option and custom admin view has a row a reviewer can open. A
 * failure lists each gap by name — add the entry under `src/fixture/`.
 */
describe('preview fixture coverage', () => {
  it(
    'leaves no collection, state, option or view without an example',
    async () => {
      const { collections } = await config
      const gaps = fixtureGaps({
        collections,
        fixtures: FIXTURES,
        components: await customComponents(),
        views: VIEWS,
      })
      expect(gaps).toEqual([])
    },
    TIMEOUT,
  )

  it(
    'has a fixture file for every collection but Payload’s own',
    async () => {
      const { collections } = await config
      const system = new Set([
        'payload-kv',
        'payload-locked-documents',
        'payload-migrations',
        'payload-preferences',
      ])
      const expected = collections.map((c) => c.slug).filter((slug) => !system.has(slug))
      expect(FIXTURES.map((f) => f.slug).sort()).toEqual(expected.sort())
    },
    TIMEOUT,
  )

  it(
    'orders the collections by their relationships, with no cycle',
    async () => {
      const { collections } = await config
      expect(() =>
        fixtureOrder(
          collections,
          FIXTURES.map((f) => f.slug),
        ),
      ).not.toThrow()
    },
    TIMEOUT,
  )

  it('finds every uploaded file under src/fixture/files', async () => {
    const files = FIXTURES.flatMap((f) => f.entries.flatMap((e) => (e.file ? [e.file] : [])))
    const missing: string[] = []
    for (const file of new Set(files)) {
      await fs.access(path.join(FIXTURE_FILES_DIR, file)).catch(() => missing.push(file))
    }
    expect(missing).toEqual([])
  })
})
