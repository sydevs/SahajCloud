import type { PayloadRequest } from 'payload'

import { AtlasManagerView } from './AtlasManagerView'
import { getAtlasManagerData } from './data'
import { parseDashboardQuery } from '../shared/model'

type AtlasManagerProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/** The Sahaj Atlas home for a program manager: what is open on their own classes. */
export default async function AtlasManager({ req, searchParams }: AtlasManagerProps) {
  const data = await getAtlasManagerData(req, parseDashboardQuery(searchParams))
  return <AtlasManagerView data={data} />
}
