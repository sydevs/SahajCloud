import type { PayloadRequest } from 'payload'

import { AtlasManagerView } from './AtlasManagerView'
import { getAtlasManagerData } from './data'
import { parseProgramQuery } from './model'

type AtlasManagerProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/** The Sahaj Atlas dashboard for a manager: the programs they may edit, a page at a time. */
export default async function AtlasManager({ req, searchParams }: AtlasManagerProps) {
  const data = await getAtlasManagerData(req, parseProgramQuery(searchParams))
  return <AtlasManagerView data={data} />
}
