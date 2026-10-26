import type { PayloadRequest } from 'payload'

import { AtlasManagerHomeView } from './AtlasManagerHomeView'
import { getAtlasManagerHomeData } from './data'
import { parseProgramQuery } from './model'

type AtlasManagerHomeProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/** The Sahaj Atlas home for a manager: the programs they may edit, a page at a time. */
export default async function AtlasManagerHome({ req, searchParams }: AtlasManagerHomeProps) {
  const data = await getAtlasManagerHomeData(req, parseProgramQuery(searchParams))
  return <AtlasManagerHomeView data={data} />
}
