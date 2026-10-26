import type { PayloadRequest } from 'payload'

import { AtlasAdminHomeView } from './AtlasAdminHomeView'
import { getAtlasAdminHomeData } from './data'

/**
 * The Sahaj Atlas home for an admin: how fresh the map is, the work only an
 * admin can move, and what changed last.
 */
export default async function AtlasAdminHome({ req }: { req: PayloadRequest }) {
  const data = await getAtlasAdminHomeData(req)
  return <AtlasAdminHomeView data={data} language={req.i18n?.language ?? 'en'} />
}
