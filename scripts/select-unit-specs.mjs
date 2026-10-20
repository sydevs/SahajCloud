import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Chooses the unit specs one edit can break, for the per-edit hook (`scripts/unit-test-hook.mjs`).
 *
 * A spec is selected when its own text names the edited module, by any specifier the lane
 * resolves: the `@/` and `@payload-config` aliases, a path relative to the spec (`../../src/…`,
 * `../utils/…`, `../../seeds/…`), or a repo-relative path like `tests/utils/…`. Specifiers are
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

/** Generated: an edit to either is a regeneration, never one typed by hand. */
const GENERATED = /^src\/payload-types\.ts$|^src\/migrations\//

/** Anything quoted. Most matches are prose or package names, which no edited path matches. */
const QUOTED = /['"]([^'"\n]+)['"]/g

/** Whether the hook acts on this repo-relative path: a hand-edited module inside the repo. */
export function isLaneSource(rel) {
  return rel !== null && MODULE_EXT.test(rel) && !GENERATED.test(rel)
}

/** `filePath` relative to `root`, POSIX, or null when it sits outside it. */
export function toRepoPath(filePath, root = REPO_ROOT) {
  const absolute = resolve(root, filePath)
  return absolute.startsWith(root + sep)
    ? absolute
        .slice(root.length + 1)
        .split(sep)
        .join('/')
    : null
}

/**
 * The repo-relative key a specifier addresses from `fromDir`. Anything neither aliased nor relative
 * is read from the repo root, as tsconfig's `baseUrl: "."` reads it, so a package name becomes a key
 * no edited path matches.
 */
export function resolveSpecifier(specifier, fromDir) {
  if (specifier === '@payload-config') return 'src/payload.config'
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`
  if (specifier === '.' || specifier.startsWith('./') || specifier.startsWith('../')) {
    return posix.join(fromDir, specifier)
  }
  return specifier
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
function listSpecs(root) {
  try {
    return readdirSync(join(root, SPEC_DIR), { recursive: true, encoding: 'utf8' })
      .filter((entry) => SPEC.test(entry))
      .map((entry) => `${SPEC_DIR}/${entry.split(sep).join('/')}`)
  } catch {
    return []
  }
}

/** Every spec by the paths its text names, itself included. Every selection is answered from this. */
export function readLane(root = REPO_ROOT) {
  const index = new Map()
  const add = (key, spec) => {
    if (!index.has(key)) index.set(key, new Set())
    index.get(key).add(spec)
  }

  for (const spec of listSpecs(root)) {
    add(spec, spec)

    let text
    try {
      text = readFileSync(join(root, spec), 'utf8')
    } catch {
      continue
    }
    for (const [, specifier] of text.matchAll(QUOTED))
      add(resolveSpecifier(specifier, dirname(spec)), spec)
  }

  return index
}

/** The specs to run for one edited path, sorted. Empty means the hook spawns nothing. */
export function selectFrom(rel, lane) {
  if (!isLaneSource(rel)) return []
  return [...new Set(referenceKeys(rel).flatMap((key) => [...(lane.get(key) ?? [])]))].sort()
}

// Gated before `readLane`, so editing a doc or a config costs nothing. That is scope as much as
// speed: a spec can quote a doc (`perf-figures-pinned` reads four), and the lean gate covers it.
export const selectSpecs = (rel, root) => (isLaneSource(rel) ? selectFrom(rel, readLane(root)) : [])

// `node scripts/select-unit-specs.mjs <path>…` prints the selection, one spec per line.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lane = readLane()
  const selected = new Set(
    process.argv.slice(2).flatMap((path) => selectFrom(toRepoPath(path), lane)),
  )
  for (const spec of [...selected].sort()) console.log(spec)
}
