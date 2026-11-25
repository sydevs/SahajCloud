/**
 * Who may impersonate, and whom. Pure, and free of server imports, so the
 * admin's start button and exit banner read the same answer the server does
 * (`@/plugins/impersonation/gate`, never the barrel, from client code).
 */
import { CONTACT_EMAIL } from '@/lib/contact'
import type { ProjectSlug } from '@/payload-types'

/** The support account behind an impersonated request, as `req.user` carries it. */
export interface Impersonator {
  id: number | string
  email: string
}

/** What this plugin reads off `req.user`, `useAuth().user` or a manager row. */
export interface GateUser {
  id?: number | string
  collection?: string
  email?: string | null
  name?: string | null
  type?: string | null
  currentProject?: ProjectSlug | null
  /** The session id Payload's JWT strategy stamps on an authenticated user. */
  _sid?: string
  impersonatedBy?: Impersonator | null
}

export const IMPERSONATION_COOKIE = 'sahajcloud-impersonation'

/** Whether `value` is the support address, `CONTACT_EMAIL`, in any case. */
export function isSupportAddress(
  value: string | null | undefined,
  supportAddress: string = CONTACT_EMAIL,
): boolean {
  return typeof value === 'string' && value.toLowerCase() === supportAddress.toLowerCase()
}

/**
 * Whether `user` is the support account: the admin holding `CONTACT_EMAIL`.
 *
 * ⚠ **The address alone would let any manager in**, since a manager may edit
 * their own email, so the account must already be an admin. ⚠ **No one can
 * move the address onto their own account** (`refuseSupportAddress`), which
 * is what keeps another admin from taking the role. `CONTACT_EMAIL` is also
 * the public support address, so changing it moves this right with it.
 *
 * An impersonated request never passes — its user is a manager, never an
 * admin — which is what refuses nesting.
 */
export function isSupportAccount(
  user: GateUser | null | undefined,
  supportAddress: string = CONTACT_EMAIL,
): boolean {
  return (
    user?.collection === 'managers' &&
    user.type === 'admin' &&
    isSupportAddress(user.email, supportAddress)
  )
}

/**
 * Whether the support account may act as `target`: an active, non-admin
 * manager. An admin shows nothing new and would hand over role editing; an
 * inactive manager is denied everywhere.
 */
export function mayImpersonate(target: GateUser): boolean {
  return target.type === 'manager'
}

export function impersonatorOf(user: GateUser | null | undefined): Impersonator | undefined {
  return user?.impersonatedBy ?? undefined
}
