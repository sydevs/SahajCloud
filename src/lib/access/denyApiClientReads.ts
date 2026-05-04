import type { Access } from 'payload'

/**
 * Collection-level read access function that blocks API-key clients from
 * accessing base CRUD endpoints (#341). Returns `false` when the authenticated
 * user is a Clients collection member; allows all other users through.
 *
 * Apply to collections that should only be consumed via curated custom
 * endpoints (e.g. /for-audience, /related-lectures) rather than the raw
 * auto-generated Payload REST CRUD paths.
 */
export const denyApiClientReads: Access = ({ req }) => req.user?.collection !== 'clients'
