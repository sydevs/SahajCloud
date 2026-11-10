/**
 * One manager, as the contacts table shows them. Kept apart from `data.ts` so
 * the client table imports no server module, not even for a type.
 */
export type ManagerContactRow = {
  id: number
  name: string
  email: string
  /** Formatted here, because only the server knows what "now" is for the read. */
  lastSignIn: { ago: string; on: string } | null
}
