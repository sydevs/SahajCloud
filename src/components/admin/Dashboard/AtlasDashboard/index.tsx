import type { PayloadRequest } from 'payload'

import { getAtlasDashboardData } from './data'
import { ManagerHome } from './ManagerHome'

/** The Sahaj Atlas project's dashboard: the programs this user may edit. */
export default async function AtlasDashboard({ req }: { req: PayloadRequest }) {
  return <ManagerHome data={await getAtlasDashboardData(req)} />
}
