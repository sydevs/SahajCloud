import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type AdminAccessContext,
  requireAdminAccess,
} from '@/components/admin/helpers/requireAdminAccess'

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn<(url: string) => void>() }))

vi.mock('next/navigation', () => ({ redirect }))

/**
 * The two admin routes the guard reads are Payload's own defaults, which
 * `tests/int/admin-route-config.int.spec.ts` pins against the real config —
 * nothing in `src/payload.config.ts` sets either.
 */
const context = ({
  canAccessAdmin,
  signedIn,
}: {
  canAccessAdmin?: boolean
  signedIn: boolean
}): AdminAccessContext => ({
  permissions: { canAccessAdmin },
  req: {
    pathname: '/admin/analytics',
    payload: {
      config: {
        admin: { routes: { login: '/login', unauthorized: '/unauthorized' } },
        routes: { admin: '/admin' },
      },
    },
    user: signedIn ? { id: 1 } : null,
  },
})

describe('requireAdminAccess', () => {
  beforeEach(() => {
    redirect.mockClear()
  })

  it('lets a manager with admin access through', () => {
    requireAdminAccess(context({ canAccessAdmin: true, signedIn: true }))

    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends an anonymous visitor to the login view, carrying the refused route', () => {
    requireAdminAccess(context({ signedIn: false }))

    expect(redirect).toHaveBeenCalledWith('/admin/login?redirect=%2Fadmin%2Fanalytics')
  })

  /** A signed-in user needs no login form — Payload's own redirect splits the same way. */
  it('sends a signed-in user without admin access to the unauthorized view', () => {
    requireAdminAccess(context({ signedIn: true }))

    expect(redirect).toHaveBeenCalledWith('/admin/unauthorized?redirect=%2Fadmin%2Fanalytics')
  })
})
