import { describe, expect, it } from 'vitest'

import type { ProjectSlug } from '@/payload-types'
import { isValidProject } from '@/plugins/access'
// Not on the barrel — this is the internal name the pin below exists to check.
import type { InternalProjectSlug } from '@/plugins/access/config/projects'

/**
 * `isValidProject` gates `POST /api/managers/set-project`, through the zod
 * refine that produces its 400. Each case below states what must hold. See
 * #671 for the `in` → `Object.hasOwn` fix, and
 * `tests/int/set-project-endpoint.int.spec.ts` for the 400 it produces.
 */

/**
 * The predicate narrows to the generated `ProjectSlug` while the runtime check
 * reads `PROJECTS`. That is honest only while the two name the same set, and
 * nothing else says so — they agree by convention, not by construction.
 *
 * `tsc` fails this on either kind of drift: a project added to `PROJECTS` but
 * not to the CMS schema, or the reverse. `pnpm typecheck:tests` is the lane,
 * so a divergence becomes a failing gate rather than a predicate quietly
 * claiming more than it checked.
 */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _projectSlugsAgree: Equals<InternalProjectSlug, ProjectSlug> = true
void _projectSlugsAgree

describe('isValidProject', () => {
  it('accepts null — the admin "All Content" view', () => {
    expect(isValidProject(null)).toBe(true)
  })

  it('rejects the removed empty-string sentinel', () => {
    expect(isValidProject('')).toBe(false)
  })

  it('rejects inherited Object.prototype keys', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(isValidProject(key)).toBe(false)
    }
  })
})
