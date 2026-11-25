/**
 * Who may impersonate, and whom (`@/plugins/impersonation/gate`). The one
 * home for the matrix; `support-impersonation.int.spec.ts` proves the wiring.
 */
import { describe, expect, it } from 'vitest'

import { isSupportAccount, mayImpersonate } from '@/plugins/impersonation/gate'

const SUPPORT = 'support@example.org'
const support = { id: 1, collection: 'managers', email: SUPPORT, type: 'admin' }

describe('isSupportAccount', () => {
  it('admits the support address on an admin, in any case', () => {
    expect(isSupportAccount(support, SUPPORT)).toBe(true)
    expect(isSupportAccount({ ...support, email: 'Support@Example.org' }, SUPPORT)).toBe(true)
  })

  it.each([
    ['another admin', { ...support, email: 'other@example.org' }],
    ['the address on a non-admin', { ...support, type: 'manager' }],
    ['an API client', { ...support, collection: 'clients' }],
    ['nobody', null],
  ])('refuses %s', (_label, user) => {
    expect(isSupportAccount(user, SUPPORT)).toBe(false)
  })
})

describe('mayImpersonate', () => {
  it('admits an active manager', () => {
    expect(mayImpersonate({ id: 2, type: 'manager' })).toBe(true)
  })

  // The support account is an admin, so this also refuses it becoming itself.
  it.each([
    ['an admin', { id: 2, type: 'admin' }],
    ['an inactive manager', { id: 2, type: 'inactive' }],
  ])('refuses %s', (_label, target) => {
    expect(mayImpersonate(target)).toBe(false)
  })
})
