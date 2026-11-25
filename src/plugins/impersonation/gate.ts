/**
 * Who may impersonate, and whom. Pure, and free of server imports, so the
 * admin's start button and exit banner read the same answer the server does
 * (`@/plugins/impersonation/gate`, never the barrel, from client code).
 */
import { CONTACT_EMAIL } from '@/lib/contact'

/** The support account behind an impersonated request, as `req.user` carries it. */
export interface Impersonator {
  id: number | string
  email: string
  name?: string | null
}

/** What the gate reads off `req.user`, `useAuth().user` or a manager row. */
export interface GateUser {
  id?: number | string
  collection?: string
  email?: string | null
  type?: string | null
  impersonatedBy?: Impersonator | null
}

/** The cookie that names the manager support is acting as. Shared with `src/middleware.ts`. */
export const IMPERSONATION_COOKIE = 'sahajcloud-impersonation'

/**
 * Whether `user` is the support account, signed in as itself.
 *
 * ⚠ **Both the address and `type: admin`.** Any admin can edit a manager's
 * email, so the address alone would let one rename themself into the role;
 * requiring `admin` means the account must also already hold full access.
 * `CONTACT_EMAIL` is the public support address, so moving it moves this
 * right with it.
 *
 * An impersonated request never passes, which is what refuses nesting.
 */
export function isSupportAccount(
  user: GateUser | null | undefined,
  supportAddress: string = CONTACT_EMAIL,
): boolean {
  return (
    user?.collection === 'managers' &&
    user.type === 'admin' &&
    !user.impersonatedBy &&
    typeof user.email === 'string' &&
    user.email.toLowerCase() === supportAddress.toLowerCase()
  )
}

/**
 * Whether the support account may act as `target`: an active, non-admin
 * manager other than itself. An admin shows nothing new and would hand over
 * role editing; an inactive manager is denied everywhere.
 */
export function mayImpersonate(actor: GateUser, target: GateUser): boolean {
  return target.type === 'manager' && String(target.id) !== String(actor.id)
}

/** The support account behind this user, when the request is impersonated. */
export function impersonatorOf(user: GateUser | null | undefined): Impersonator | undefined {
  return user?.impersonatedBy ?? undefined
}
