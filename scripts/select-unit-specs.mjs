import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPO_ROOT, toRepoPath } from './hook-run.mjs'

/**
 * Chooses the unit specs one edit can break, for the per-edit hook (`scripts/unit-test-hook.mjs`).
 *
 * A spec is selected when its own text names the edited file — a module, or a Markdown doc a spec
 * asserts on — by any specifier the lane resolves: the `@/` and `@payload-config` aliases, a path relative to the spec (`../../src/…`,
 * `../utils/…`, `../../seeds/…`), or a repo-relative path like `tests/utils/…`. Specifiers are
 * resolved, never matched by name: specs live in `tests/unit/` and their subjects do not, so there
 * is no sibling to find, and `@/lib/thing-other` must not select `thing.ts`.
 *
 * ⚠ **It does not follow imports.** `src/lib/richEditor/index.ts` selects nothing, though dozens of
 * specs reach it through a collection. Following the graph selects most of the lane for a shared
 * module, which no per-edit budget fits (`tests/PERF.md`). The lean gate and CI still run the whole
 * lane, and `docs/rules/testing-reqs.md` carries the trade.
 */

/** What the unit project collects (`vitest.config.mts`). */
const SPEC_DIR = 'tests/unit'
const SPEC = /\.spec\.ts$/

/** `.json` too: specs import translation schemas and status config directly. */
const MODULE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/

/**
 * Markdown is selectable because a spec can assert on a doc's text, and the pins that do are the
 * ones an edit to that doc breaks: `perf-figures-pinned.spec.ts` holds four docs in agreement.
 */
const DOC_EXT = /\.md$/

/** Generated: an edit to either is a regeneration, never one typed by hand. */
const GENERATED = /^src\/payload-types\.ts$|^src\/migrations\//

/**
 * Anything quoted, closed by the quote that opened it, so `"it's"` cannot swallow the opening
 * quote of a specifier later on the line. Most matches are prose or package names, which no
 * edited path matches.
 */
const QUOTED = /(['"])([^'"\n]+)\1/g

/** Whether the hook acts on this repo-relative path: a hand-edited module or doc inside the repo. */
export function isLaneSource(rel) {
  return rel !== null && (MODULE_EXT.test(rel) || DOC_EXT.test(rel)) && !GENERATED.test(rel)
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
 * it; without, as an import writes it; and by its folder, for an `index` file. A doc is only ever
 * quoted whole, so stripping its extension adds a key nothing matches.
 */
function referenceKeys(rel) {
  const noExt = rel.replace(MODULE_EXT, '')
  return noExt.endsWith('/index') ? [rel, noExt, noExt.slice(0, -'/index'.length)] : [rel, noExt]
}

/** Every spec the unit lane collects, repo-relative and POSIX. */
// Unguarded: a lane that cannot be listed must surface as a hook error, not as silence.
function listSpecs(root) {
  return readdirSync(join(root, SPEC_DIR), { recursive: true, encoding: 'utf8' })
    .filter((entry) => SPEC.test(entry))
    .map((entry) => `${SPEC_DIR}/${entry.split(sep).join('/')}`)
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
    for (const [, , specifier] of text.matchAll(QUOTED))
      add(resolveSpecifier(specifier, dirname(spec)), spec)
  }

  return index
}

/** The specs to run for one edited path, sorted. Empty means the hook spawns nothing. */
export function selectFrom(rel, lane) {
  if (!isLaneSource(rel)) return []
  return [...new Set(referenceKeys(rel).flatMap((key) => [...(lane.get(key) ?? [])]))].sort()
}

// Gated before `readLane`, so an edit the hook ignores never pays to index the lane.
export const selectSpecs = (rel, root) => (isLaneSource(rel) ? selectFrom(rel, readLane(root)) : [])

// `node scripts/select-unit-specs.mjs <path>…` prints the selection, one spec per line.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lane = readLane()
  const selected = new Set(
    process.argv.slice(2).flatMap((path) => selectFrom(toRepoPath(path), lane)),
  )
  for (const spec of [...selected].sort()) console.log(spec)
}
