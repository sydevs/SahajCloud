/**
 * Who may impersonate, and whom (`@/plugins/login/impersonation/gate`). The one
 * home for the matrix; `support-impersonation.int.spec.ts` proves the wiring.
 */
import { describe, expect, it } from 'vitest'

import {
  type GateUser,
  isSupportAccount,
  mayBeImpersonated,
} from '@/plugins/login/impersonation/gate'

const SUPPORT = 'support@example.org'
const support: GateUser = { id: 1, collection: 'managers', email: SUPPORT, type: 'admin' }

describe('isSupportAccount', () => {
  it('admits the support address on an admin, in any case', () => {
    expect(isSupportAccount(support, SUPPORT)).toBe(true)
    expect(isSupportAccount({ ...support, email: 'Support@Example.org' }, SUPPORT)).toBe(true)
  })

  it.each<[string, GateUser | null]>([
    ['another admin', { ...support, email: 'other@example.org' }],
    ['the address on a non-admin', { ...support, type: 'manager' }],
    ['an API client', { ...support, collection: 'clients' }],
    ['nobody', null],
  ])('refuses %s', (_label, user) => {
    expect(isSupportAccount(user, SUPPORT)).toBe(false)
  })
})

describe('mayBeImpersonated', () => {
  it('admits an active, confirmed manager', () => {
    expect(mayBeImpersonated({ id: 2, type: 'manager', _verified: true })).toBe(true)
  })

  // The support account is an admin, so this also refuses it becoming itself.
  // An unconfirmed manager authenticates nobody, so the start refuses what
  // every request would.
  it.each<[string, GateUser]>([
    ['an admin', { id: 2, type: 'admin', _verified: true }],
    ['an inactive manager', { id: 2, type: 'inactive', _verified: true }],
    ['an unconfirmed manager', { id: 2, type: 'manager', _verified: false }],
    ['a manager who has never been asked', { id: 2, type: 'manager' }],
  ])('refuses %s', (_label, target) => {
    expect(mayBeImpersonated(target)).toBe(false)
  })
})
