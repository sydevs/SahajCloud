import type { WidgetServerProps } from 'payload'

import { CollectionCards } from '@payloadcms/ui/rsc'

import { getAtlasDashboardData } from './data'
import { isAtlasOrganiser } from './model'
import { OrganiserHome } from './OrganiserHome'

export async function AtlasDashboardContent({ req }: Pick<WidgetServerProps, 'req'>) {
  const data = await getAtlasDashboardData(req)
  return data ? <OrganiserHome data={data} /> : null
}

/** A saved organiser layout must still work after switching to another project. */
export default function AtlasDashboard(props: WidgetServerProps) {
  return isAtlasOrganiser(props.req.user) ? (
    <AtlasDashboardContent req={props.req} />
  ) : (
    <CollectionCards {...props} />
  )
}
