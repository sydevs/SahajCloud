import type { PayloadRequest } from 'payload'

/**
 * A non-admin manager working in Sahaj Atlas: gets the Atlas sidebar.
 *
 * `type` is load-bearing — an admin must keep `DefaultNav`. It tests no role,
 * so it is not a check for `atlas-manager`. The dashboard asks only which
 * project is current, and reads `currentProject` itself.
 */
export function isManagerInAtlasProject(user: PayloadRequest['user'] | undefined): boolean {
  return (
    user?.collection === 'managers' &&
    user.type === 'manager' &&
    user.currentProject === 'sahaj-atlas'
  )
}
