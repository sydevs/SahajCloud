import type { PayloadRequest } from 'payload'

import { AtlasAdminView } from './AtlasAdminView'
import { getAtlasAdminData } from './data'

/**
 * The Sahaj Atlas dashboard for an admin: how fresh the map is, the work only an
 * admin can move, and what changed last.
 */
export default async function AtlasAdmin({ req }: { req: PayloadRequest }) {
  const data = await getAtlasAdminData(req)
  return <AtlasAdminView data={data} language={req.i18n?.language ?? 'en'} />
}
