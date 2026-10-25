import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type AdminAccessContext,
  requireAdminAccess,
} from '@/components/admin/helpers/requireAdminAccess'

/**
 * `redirect` throws, as Next's own does, so the guard stops where it would in
 * production — the shape `preview-auto-signin.int.spec.ts` already uses.
 */
const { REDIRECTED, redirect } = vi.hoisted(() => {
  const REDIRECTED = new Error('NEXT_REDIRECT')
  return {
    REDIRECTED,
    redirect: vi.fn((_url: string): never => {
      throw REDIRECTED
    }),
  }
})

vi.mock('next/navigation', () => ({ redirect }))

/**
 * The two admin routes the guard reads are Payload's own defaults, which
 * `tests/int/admin-route-config.int.spec.ts` pins against the real config —
 * nothing in `src/payload.config.ts` sets either.
 */
const context = ({
  canAccessAdmin,
  query = '',
  signedIn,
}: {
  canAccessAdmin: boolean | undefined
  query?: string
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
    searchParams: new URLSearchParams(query),
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
    expect(() =>
      requireAdminAccess(context({ canAccessAdmin: undefined, signedIn: false })),
    ).toThrow(REDIRECTED)

    expect(redirect).toHaveBeenCalledWith('/admin/login?redirect=%2Fadmin%2Fanalytics')
  })

  /** A signed-in user needs no login form — Payload's own redirect splits the same way. */
  it('sends a signed-in user without admin access to the unauthorized view', () => {
    expect(() => requireAdminAccess(context({ canAccessAdmin: false, signedIn: true }))).toThrow(
      REDIRECTED,
    )

    expect(redirect).toHaveBeenCalledWith('/admin/unauthorized?redirect=%2Fadmin%2Fanalytics')
  })

  /**
   * The refused route round-trips whole, so a filtered view comes back filtered.
   * An inbound `redirect` is dropped rather than nested, as Payload's own does.
   */
  it('carries the view’s own query, less an inbound redirect', () => {
    expect(() =>
      requireAdminAccess(
        context({
          canAccessAdmin: false,
          query: 'range=30d&redirect=%2Felsewhere',
          signedIn: true,
        }),
      ),
    ).toThrow(REDIRECTED)

    expect(redirect).toHaveBeenCalledWith(
      '/admin/unauthorized?redirect=%2Fadmin%2Fanalytics%3Frange%3D30d',
    )
  })
})
