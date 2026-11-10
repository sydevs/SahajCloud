/**
 * An `afterChange` hook on `user-submissions` must gate on `data`, the input,
 * not on `doc`.
 *
 * `doc` is the `afterRead` projection, and a create's `select` is a query
 * parameter the caller sets which nothing polices —
 * `validateClientQueryParamsHook` returns on anything that is not a read, and
 * `docs/rules/api-clients.md` states that writes are unaffected. So
 * `POST /api/user-submissions?select[id]=true` empties `doc` of every column but
 * `id`, and a hook reading its guard there is switched off from the request.
 *
 * Three hooks were reachable that way at once (#1093): screening was never
 * queued, the event's fullness flag was never recomputed, and a registrant's
 * mailing-list consent recorded nothing. Each was a one-word fix, which is
 * exactly why a reviewer will not catch the fourth — so it is checked here
 * rather than written down.
 *
 * `doc.id` is always exempt: payload returns the new row's id whatever the
 * projection asks for, and it is the one thing `data` does not carry.
 *
 * This reads the hooks' own source text, so a read that reaches `doc` through a
 * local alias is invisible to it. That is the known limit of the cheap check,
 * not a licence — and `tests/int/user-submissions-narrow-select.int.spec.ts`
 * drives the real request for the three that mattered.
 *
 * Scoped to this collection because it is the one intake for every public write.
 * Widen it the day a second collection takes client-authored creates.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const HOOKS_DIR = join(process.cwd(), 'src/collections/UserSubmissions/hooks')

/** `doc.id` is the one projection-proof read. */
const EXEMPT_FIELDS = new Set(['id'])

/**
 * The body of each `CollectionAfterChangeHook` in a module, keyed by its name.
 *
 * An `afterDelete` hook is deliberately not collected: a delete has no `data`,
 * and no client holds delete on this collection.
 */
function afterChangeHookBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>()
  const declaration = /export const (\w+): CollectionAfterChangeHook/g
  let match: RegExpExecArray | null
  while ((match = declaration.exec(source)) !== null) {
    const rest = source.slice(match.index + match[0].length)
    // Top-level exports only, so the next one bounds this body.
    const end = rest.search(/\nexport (?:const|function|type|interface) /)
    bodies.set(match[1]!, end === -1 ? rest : rest.slice(0, end))
  }
  return bodies
}

/** Lines reading `doc.<field>` without reading the same field off `data`. */
function unguardedDocReads(body: string): string[] {
  return (
    body
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      // `previousDoc` and `originalDoc` are other documents entirely.
      .map((line) => line.replace(/\b(?:previous|original)Doc\b/g, 'otherDocument'))
      .filter((line) => {
        const reads = [...line.matchAll(/\bdoc\.(\w+)/g)].map((m) => m[1]!)
        return reads.some(
          (field) =>
            !EXEMPT_FIELDS.has(field) &&
            !line.includes(`data.${field}`) &&
            !line.includes(`'${field}' in data`),
        )
      })
      .map((line) => line.trim())
  )
}

describe('user-submissions afterChange hooks read their guards from `data`', () => {
  const modules = readdirSync(HOOKS_DIR).filter((name) => name.endsWith('.ts'))

  it('finds the hooks to check', () => {
    const named = modules.flatMap((name) => [
      ...afterChangeHookBodies(readFileSync(join(HOOKS_DIR, name), 'utf8')).keys(),
    ])
    // A rename that empties this check must fail it rather than pass silently.
    expect(named).toContain('queueScreening')
    expect(named).toContain('mergeRepeatRegistration')
    expect(named).toContain('spawnSubscribeFromRegistration')
    expect(named).toContain('syncFullnessAfterChange')
    expect(named).toContain('syncCommunityFeedback')
  })

  for (const name of modules) {
    const bodies = afterChangeHookBodies(readFileSync(join(HOOKS_DIR, name), 'utf8'))
    for (const [hook, body] of bodies) {
      it(`${hook} (${name})`, () => {
        expect(unguardedDocReads(body)).toEqual([])
      })
    }
  }
})
