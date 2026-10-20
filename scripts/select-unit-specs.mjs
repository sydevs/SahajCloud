import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Chooses the unit specs one edit can break, for the per-edit hook (`scripts/unit-test-hook.mjs`).
 *
 * A spec is selected when its own text names the edited module, by any specifier the lane
 * resolves: the `@/`, `@payload-config` and `tests/` aliases, a path relative to the spec
 * (`../../src/…`, `../utils/…`, `../../seeds/…`), or a quoted repo-relative path. Specifiers are
 * resolved, never matched by name: specs live in `tests/unit/` and their subjects do not, so there
 * is no sibling to find, and `@/lib/thing-other` must not select `thing.ts`.
 *
 * ⚠ **It does not follow imports.** `src/lib/richEditor/index.ts` selects nothing, though dozens of
 * specs reach it through a collection. Following the graph selects most of the lane for a shared
 * module, which no per-edit budget fits (`tests/PERF.md`). The lean gate and CI still run the whole
 * lane, and `docs/rules/testing-reqs.md` carries the trade.
 */

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** What the unit project collects (`vitest.config.mts`). */
const SPEC_DIR = 'tests/unit'
const SPEC = /\.spec\.ts$/

/** `.json` too: specs import translation schemas and status config directly. */
const MODULE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/

/** Generated, so an edit to either is a regeneration nobody types, and no spec runs it. */
const GENERATED = /^src\/payload-types\.ts$|^src\/migrations\//

/** Anything quoted. Most matches are prose or package names, and resolve to nothing. */
const QUOTED = /['"]([^'"\n]+)['"]/g

/** Whether the hook acts on this repo-relative path at all. */
export function isLaneSource(rel) {
  return (
    !rel.startsWith('/') &&
    !rel.startsWith('../') &&
    !rel.startsWith('node_modules/') &&
    MODULE_EXT.test(rel) &&
    !GENERATED.test(rel)
  )
}

/** `filePath` relative to `root` when it sits inside it; otherwise unchanged, and outside the lane. */
export function toRepoPath(filePath, root = REPO_ROOT) {
  const absolute = resolve(root, filePath)
  return absolute.startsWith(root + sep)
    ? absolute
        .slice(root.length + 1)
        .split(sep)
        .join('/')
    : filePath
}

/** The repo-relative module a specifier addresses from `fromDir`, or null for a package. */
export function resolveSpecifier(specifier, fromDir) {
  if (specifier === '@payload-config') return 'src/payload.config'
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`
  if (/^(src|tests|scripts|seeds)\//.test(specifier)) return specifier
  if (specifier !== '.' && !specifier.startsWith('./') && !specifier.startsWith('../')) return null

  const parts = fromDir.split('/')
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.' && segment !== '') parts.push(segment)
  }

  return parts.join('/')
}

/**
 * How a resolved specifier can address this module: with its extension, as a quoted path names
 * it; without, as an import writes it; and by its folder, for an `index` file.
 */
function referenceKeys(rel) {
  const noExt = rel.replace(MODULE_EXT, '')
  return noExt.endsWith('/index') ? [rel, noExt, noExt.slice(0, -'/index'.length)] : [rel, noExt]
}

/** Every spec the unit lane collects, repo-relative and POSIX. */
export function listSpecs(root = REPO_ROOT) {
  try {
    return readdirSync(join(root, SPEC_DIR), { recursive: true, encoding: 'utf8' })
      .filter((entry) => SPEC.test(entry))
      .map((entry) => `${SPEC_DIR}/${entry.split(sep).join('/')}`)
      .sort()
  } catch {
    return []
  }
}

/** Every spec by the modules its text names, read once. Every selection is answered from this. */
export function readLane(root = REPO_ROOT) {
  const specs = listSpecs(root)
  const index = new Map()

  for (const spec of specs) {
    const fromDir = dirname(spec)
    let text = ''
    try {
      text = readFileSync(join(root, spec), 'utf8')
    } catch {
      continue
    }

    for (const [, specifier] of text.matchAll(QUOTED)) {
      const target = resolveSpecifier(specifier, fromDir)
      if (!target) continue
      if (!index.has(target)) index.set(target, new Set())
      index.get(target).add(spec)
    }
  }

  return { specs, index }
}

/** The specs to run for one edited path, sorted. Empty means the hook spawns nothing. */
export function selectFrom(rel, lane) {
  if (!isLaneSource(rel)) return []

  const selected = new Set(lane.specs.includes(rel) ? [rel] : [])
  for (const key of referenceKeys(rel)) {
    for (const spec of lane.index.get(key) ?? []) selected.add(spec)
  }

  return [...selected].sort()
}

// Gated before `readLane`: the hook fires on every Edit and Write, and a Markdown edit should not
// pay for reading every spec to learn it is outside the lane.
export const selectSpecs = (rel, root = REPO_ROOT) =>
  isLaneSource(rel) ? selectFrom(rel, readLane(root)) : []

// `node scripts/select-unit-specs.mjs <path>…` prints the selection, one spec per line.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lane = readLane()
  const selected = new Set(
    process.argv.slice(2).flatMap((path) => selectFrom(toRepoPath(path), lane)),
  )
  for (const spec of [...selected].sort()) console.log(spec)
}
