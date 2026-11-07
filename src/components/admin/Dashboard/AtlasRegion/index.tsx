import type { PayloadRequest } from 'payload'

import { SetStepNav } from '@payloadcms/ui'

import { getAtlasRegionData } from './data'
import { CenteredNotice } from '../../CenteredNotice'
import styles from '../shared/Dashboard.module.css'
import { HomeHeader } from '../shared/HomeHeader'
import { parseDashboardQuery } from '../shared/model'
import { OpenItemsList } from '../shared/OpenItemsList'
import { RegionOverviewTable } from '../shared/RegionOverviewTable'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

type AtlasRegionProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * The Sahaj Atlas home for a region manager, and an admin's view of one region.
 * A region outside the reader's own subtree renders the refusal, decided before
 * anything is read.
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
  const { items, regions, statistics } = data

  return (
    <section aria-label="Your regions" className={styles.home}>
      {/* A region opened from the overview needs the trail to say which subtree it is. */}
      <SetStepNav nav={data.breadcrumbs} />
      <HomeHeader canCreate subtitle={data.description} title="Your regions" />
      <StatTiles label="Verification health" tiles={statistics.health} />
      <StatTiles label="Last 30 days" tiles={statistics.analytics} />
      <SectionTabs
        active={items.query.section}
        progress={items.progress}
        tabs={[
          { count: items.progress?.open ?? items.counts.all, label: 'Open items', value: 'items' },
          { count: null, label: 'Regions overview', value: 'regions' },
        ]}
      />
      {items.query.section === 'regions' ? (
        <RegionOverviewTable label="Region" rows={regions} subtree />
      ) : (
        <OpenItemsList
          data={items}
          emptyBanner="All clear. Every program in your regions is on track."
          showMine
        />
      )}
    </section>
  )
}
