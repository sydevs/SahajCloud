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
 * Every import in the tree, resolved, as `target module → files importing it`.
 *
 * Built in **one pass over the files**, not one pass per lib module. The first
 * version scanned every source for each of ~150 modules; it ran in 1.4s alone
 * and then timed out at 8s inside the parallel unit lane, which is the only
 * place it actually runs. Inverting it is ~50ms.
 *
 * Both import forms resolve to the same key — an absolute path without
 * extension — so `@/lib/notifications/recipients`, a barrel's `./recipients`
 * and a sibling's `./recipients` all land together.
 */
function buildImportGraph(dirs: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()

  for (const dir of dirs) {
    for (const file of sourceFiles(dir)) {
      const rel = relative(ROOT, file)
      const source = readFileSync(file, 'utf8')
      for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) {
        const target = specifier!.startsWith('@/lib/')
          ? join(LIB, specifier!.slice('@/lib/'.length))
          : specifier!.startsWith('.')
            ? resolve(file, '..', specifier!)
            : null
        if (!target) continue
        const importers = graph.get(target) ?? new Set<string>()
        importers.add(rel)
        graph.set(target, importers)
      }
    }
  }
  return graph
}

/** Files importing the module at `@/lib/<modulePath>`, however they spell it. */
function consumersOf(specifier: string, graph: Map<string, Set<string>>): string[] {
  const modulePath = specifier.replace('@/lib/', '')
  const importers = graph.get(join(LIB, modulePath)) ?? new Set<string>()
  // A module never counts as its own consumer.
  return [...importers].filter(
    (rel) => rel !== `src/lib/${modulePath}.ts` && rel !== `src/lib/${modulePath}.tsx`,
  )
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
  '@/lib/notifications/sendRegistrationNotification',
  '@/lib/registrations/gating',
  '@/lib/utilities/weightedSample',
])

describe('src/lib holds shared code only', () => {
  const graph = buildImportGraph([join(ROOT, 'src'), join(ROOT, 'scripts')])

  it('has no module with exactly one consumer', () => {
    const offenders: string[] = []
    for (const specifier of libModules()) {
      if (KNOWN_SINGLE_CONSUMER.has(specifier)) continue
      const consumers = consumersOf(specifier, graph)
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
