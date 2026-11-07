import type { PayloadRequest } from 'payload'

import { AtlasAdminView } from './AtlasAdminView'
import { getAtlasAdminData } from './data'
import { parseDashboardQuery } from '../shared/model'

type AtlasAdminProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * The Sahaj Atlas home for an admin: how the map is doing, and the work only
 * an admin can move.
 */
export default async function AtlasAdmin({ req, searchParams }: AtlasAdminProps) {
  const data = await getAtlasAdminData(req, parseDashboardQuery(searchParams))
  return <AtlasAdminView data={data} />
}
