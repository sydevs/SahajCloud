import { describe, expect, it } from 'vitest'

import { getProjectSlugs, isValidProject } from '@/plugins/access'

/**
 * `isValidProject` gates `POST /api/managers/set-project`, through the zod
 * refine that produces its 400. It used to test `value in PROJECTS`, and `in`
 * walks the prototype chain — so `'toString'`, `'constructor'` and
 * `'valueOf'` all passed.
 *
 * The failure was not a widened grant. Payload's own select validation still
 * refused the write, but it threw inside the handler's `try`, so the caller
 * got a 500 `Failed to change project.` where the schema promises a 400
 * `Invalid project.` Found while removing the `''` sentinel (#671), which is
 * what made this guard the field's stated contract.
 */

describe('isValidProject', () => {
  it('accepts every real project slug', () => {
    for (const slug of getProjectSlugs()) {
      expect(isValidProject(slug)).toBe(true)
    }
  })

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
