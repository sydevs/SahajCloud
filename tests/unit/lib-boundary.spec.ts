import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `src/lib/` is for code shared across owners. A module in there with exactly
 * **one** consumer isn't shared — it's that consumer's private code sitting in
 * the commons, importable by anything, and read by anyone tracing the feature
 * as though it were general-purpose (`.claude/rules/project-structure.md`,
 * rule 4).
 *
 * The rule predates this test and had drifted anyway: five modules had a single
 * consumer each. It only holds if something checks, so this does.
 *
 * **Counting has three traps**, each of which produced a wrong answer while
 * this was being written:
 *
 * 1. **Barrel re-exports.** `recipients.ts` looked single-consumer by direct
 *    import and has three, two of them reaching it through
 *    `lib/notifications/index.ts`.
 * 2. **Sibling relative imports.** `browserRendering.ts` is imported by
 *    `./verifyEmbed` next door, which a `@/lib/...` search never sees.
 * 3. **`scripts/`.** The email preview scripts import senders directly.
 *
 * So consumers are counted over the whole repo, in every import form. Tests and
 * scripts count as consumers of what they import.
 *
 * A module consumed **only from inside `src/lib`** is exempt: that is a shared
 * module decomposed into parts (a barrel and its members; an integration seam
 * kept separate so it unit-tests without booting its caller). The folder is the
 * unit there, and whether it is shared is answered by its entry point. What
 * this catches is the other shape — a lib module private to exactly one owner
 * *outside* lib.
 */

const ROOT = resolve(__dirname, '../..')
const LIB = join(ROOT, 'src/lib')

/** Every source file that could import something, outside `src/lib` itself. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/** Modules under `src/lib`, as their `@/lib/...` specifier. */
function libModules(): string[] {
  return sourceFiles(LIB)
    .filter((f) => !f.endsWith('.d.ts'))
    .map((f) => `@/lib/${relative(LIB, f).replace(/\.tsx?$/, '')}`)
}

/**
 * Every candidate importer, read once. The first version re-read the tree for
 * each of ~150 lib modules and blew the unit lane's 5s budget; sources are
 * small, so one pass into memory keeps this well under a second.
 */
function readAll(dirs: string[]): Map<string, string> {
  const sources = new Map<string, string>()
  for (const dir of dirs) {
    for (const file of sourceFiles(dir)) {
      sources.set(relative(ROOT, file), readFileSync(file, 'utf8'))
    }
  }
  return sources
}

/**
 * Files importing `specifier`, by any route: the `@/lib/...` path, or a
 * relative path from a sibling or barrel that resolves to the same file.
 */
function consumersOf(specifier: string, sources: Map<string, string>): string[] {
  const modulePath = specifier.replace('@/lib/', '')
  const target = join(LIB, modulePath)
  const consumers: string[] = []

  for (const [rel, source] of sources) {
    if (rel === `src/lib/${modulePath}.ts` || rel === `src/lib/${modulePath}.tsx`) continue
    if (source.includes(`'${specifier}'`)) {
      consumers.push(rel)
      continue
    }
    // Relative imports: resolve each against this file's directory and see if
    // it lands on the module. Catches both `./sibling` and a barrel's re-export.
    const dir = join(ROOT, rel, '..')
    for (const match of source.matchAll(/from '(\.[^']*)'/g)) {
      if (resolve(dir, match[1]!) === target) {
        consumers.push(rel)
        break
      }
    }
  }
  return consumers
}

/**
 * Modules that already had one consumer when this check was introduced.
 *
 * A recorded baseline, not an approval: the rule is new to an existing tree, so
 * failing on everything at once would have meant either an unreviewable reshuffle
 * or no check at all. New violations fail; these are the backlog, and the list
 * should only ever shrink.
 *
 * Each is one of two shapes. Some are genuinely one owner's private helper and
 * should move (`utilities/weightedSample` belongs to the AppCards endpoint).
 * Others are the entry point of a cohesive lib folder whose *other* files have
 * different owners — `atlasSidebar/getAtlasSidebarData` reads what `cache.ts`
 * invalidates for jobs and Events hooks — and those should be justified here
 * rather than moved, since moving one file would split a working module.
 *
 * Adding an entry requires the second kind of reason. "Pre-existing" is not one
 * for anything written after this test.
 */
const KNOWN_SINGLE_CONSUMER = new Set<string>([
  '@/lib/atlasSidebar/getAtlasSidebarData',
  '@/lib/logger/clientLogger',
  '@/lib/meditations/framesBeyondDuration',
  '@/lib/meditations/meditationShape',
  '@/lib/notifications/sendContactAdmin',
  '@/lib/registrations/gating',
  '@/lib/utilities/weightedSample',
])

describe('src/lib holds shared code only', () => {
  const sources = readAll([join(ROOT, 'src'), join(ROOT, 'scripts')])

  it('has no module with exactly one consumer', () => {
    const offenders: string[] = []
    for (const specifier of libModules()) {
      if (KNOWN_SINGLE_CONSUMER.has(specifier)) continue
      const consumers = consumersOf(specifier, sources)
      if (consumers.length !== 1) continue
      const [only] = consumers
      // Consumed only from inside `src/lib` — that's a shared module split into
      // parts (a barrel and its members, an integration seam kept separately so
      // it unit-tests without booting its caller). The folder is the unit, and
      // whether *it* is shared is answered by its own entry point.
      if (only!.startsWith('src/lib/')) continue
      // Operator scripts are deliberately thin CLI wrappers with their routine
      // in lib, so it can be unit-tested without executing the script
      // (`.claude/rules/scripts.md` records this per backfill). The script is
      // the wrapper, not the owner.
      if (only!.startsWith('scripts/')) continue
      offenders.push(`${specifier} → only ${only}`)
    }
    // Move it beside its consumer. A barrel that re-exports it counts as a
    // consumer — if the barrel is the *only* one, the export is dangling and
    // should go too (that was true of `buildVerifyEmailLink`).
    expect(offenders).toEqual([])
  })
})
