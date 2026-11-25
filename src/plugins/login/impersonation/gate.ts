/**
 * Who may impersonate, and whom. Pure, and free of server imports, so the
 * admin's start button and exit banner read the same answer the server does
 * (`@/plugins/login/impersonation/gate`, never the login barrel, from client code).
 */
import { CONTACT_EMAIL } from '@/lib/contact'
import type { Manager } from '@/payload-types'

/**
 * The support account behind an impersonated request, as `req.user` carries it.
 *
 * `id` is widened deliberately: Payload types an authenticated user's id as
 * `number | string` whatever the collection's own column is.
 */
export interface Impersonator extends Pick<Manager, 'email'> {
  id: number | string
}

/**
 * What this plugin reads off `req.user`, `useAuth().user` or a manager row —
 * every stored column taken from the generated type, so `type` carries its own
 * three values and the literals below are checked against them.
 */
export interface GateUser extends Partial<
  Pick<Manager, '_verified' | 'currentProject' | 'email' | 'name' | 'type'>
> {
  id?: number | string
  collection?: string
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
 * manager who has confirmed their email. An admin shows nothing new and would
 * hand over role editing; an inactive manager is denied everywhere.
 *
 * ⚠ **`_verified` is here so the start refuses what every request would.**
 * Payload's JWT strategy yields no user while that flag is false, so an
 * invited manager who never confirmed would pass a `type`-only gate, take the
 * cookie, and then read as support on every request with nothing said.
 */
export function mayImpersonate(target: GateUser): boolean {
  return target.type === 'manager' && target._verified === true
}

export function impersonatorOf(user: GateUser | null | undefined): Impersonator | undefined {
  return user?.impersonatedBy ?? undefined
}
