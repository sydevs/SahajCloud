import { describe, expect, it } from 'vitest'

import { isValidProject } from '@/plugins/access'

/**
 * `isValidProject` gates `POST /api/managers/set-project`, through the zod
 * refine that produces its 400. Each case below states what must hold. See
 * #671 for the `in` → `Object.hasOwn` fix, and
 * `tests/int/set-project-endpoint.int.spec.ts` for the 400 it produces.
 */

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
