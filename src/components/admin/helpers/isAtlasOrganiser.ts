import type { PayloadRequest } from 'payload'

/** A non-admin manager working in Sahaj Atlas: gets the Atlas sidebar and the organiser home. */
export function isAtlasOrganiser(user: PayloadRequest['user'] | undefined): boolean {
  return (
    user?.collection === 'managers' &&
    user.type === 'manager' &&
    user.currentProject === 'sahaj-atlas'
  )
}
