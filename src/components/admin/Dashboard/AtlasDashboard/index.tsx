import type { PayloadRequest } from 'payload'

import { getAtlasDashboardData } from './data'
import { ManagerHome } from './ManagerHome'
import { parseProgramQuery } from './model'

type AtlasDashboardProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/** The Sahaj Atlas project's manager home: the programs this user may edit, a page at a time. */
export default async function AtlasDashboard({ req, searchParams }: AtlasDashboardProps) {
  const data = await getAtlasDashboardData(req, parseProgramQuery(searchParams))
  return <ManagerHome data={data} />
}
