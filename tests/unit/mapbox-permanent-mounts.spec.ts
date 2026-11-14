/**
 * Every admin Mapbox search asks for a permanent answer (#893).
 *
 * ⚠ **The type cannot reach either case below.** `permanent` is optional on
 * the library's own props, so a mount that drops the line still compiles, and
 * no type says which component was mounted. The picker is where a manager's
 * stored `Regions.mapboxId` comes from in normal operation, so this reads the
 * source instead.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const ADMIN_DIR = join(process.cwd(), 'src/components/admin')
const MAPBOX_PACKAGE = '@mapbox/search-js-react'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('admin Mapbox search mounts', () => {
  const mounts = sourceFiles(ADMIN_DIR)
    .map((path) => [path, readFileSync(path, 'utf8')] as const)
    .filter(([, source]) => source.includes(MAPBOX_PACKAGE))

  it('finds the picker, so the cases below are not vacuous', () => {
    expect(mounts.map(([path]) => path)).toContain(
      join(ADMIN_DIR, 'AddressSearchField/AddressSearchField.tsx'),
    )
  })

  it.each(mounts)('%s asks for a permanent answer', (_path, source) => {
    expect(source).toMatch(/permanent:\s*true/)
  })

  it.each(mounts)('%s mounts no Search Box, which cannot be permanent', (_path, source) => {
    // Search Box publishes no `permanent` parameter at all, so an answer it
    // gives may not be stored however the mount is configured.
    expect(source).not.toMatch(/\bSearchBox\b/)
  })
})
