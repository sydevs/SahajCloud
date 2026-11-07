import type { PayloadRequest } from 'payload'

import { AtlasRegionView } from './AtlasRegionView'
import { getAtlasRegionData } from './data'
import { CenteredNotice } from '../../CenteredNotice'
import { parseDashboardQuery } from '../shared/model'

type AtlasRegionProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * The Sahaj Atlas home for a region manager, and an admin's view of one region.
 *
 * A region outside the reader's own subtree renders the refusal rather than
 * the home — the loader decides that before it reads anything, so a refused
 * visitor learns nothing about what is in there.
 */
export default async function AtlasRegion({ req, searchParams }: AtlasRegionProps) {
  const data = await getAtlasRegionData(req, parseDashboardQuery(searchParams))
  if (!data.allowed) {
    return (
      <CenteredNotice fullHeight title="You don’t look after this region">
        <p>Ask an admin to add you to it, or go back to the regions you manage.</p>
      </CenteredNotice>
    )
  }
  return <AtlasRegionView data={data} />
}
