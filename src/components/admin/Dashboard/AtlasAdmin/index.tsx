import type { PayloadRequest } from 'payload'

import Link from 'next/link'

import { getAtlasAdminData } from './data'
import styles from '../shared/Dashboard.module.css'
import { HomeHeader } from '../shared/HomeHeader'
import { parseDashboardQuery } from '../shared/model'
import { OpenItemsList } from '../shared/OpenItemsList'
import { RegionOverviewTable } from '../shared/RegionOverviewTable'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

type AtlasAdminProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * The Sahaj Atlas home for an admin: how the map is doing, and the work only
 * an admin can move.
 *
 * ⚠ **No meter here.** Progress is a share of somebody's own workload, and an
 * admin's list is what fell through everyone else's.
 */
export default async function AtlasAdmin({ req, searchParams }: AtlasAdminProps) {
  const { countries, items, spamSignups, statistics } = await getAtlasAdminData(
    req,
    parseDashboardQuery(searchParams),
  )
  const programs = statistics.analytics[0]?.value ?? 0

  return (
    <section aria-label="Sahaj Atlas overview" className={styles.home}>
      <HomeHeader
        subtitle={`${programs} event${programs === 1 ? '' : 's'} · ${countries.totalDocs} countr${countries.totalDocs === 1 ? 'y' : 'ies'}`}
        title="Sahaj Atlas"
      />
      <StatTiles label="Verification health" tiles={statistics.health} />
      <SectionTabs
        active={items.query.section}
        progress={null}
        tabs={[
          { count: items.counts.all, label: 'Open items', value: 'items' },
          { count: null, label: 'Countries overview', value: 'regions' },
        ]}
      />
      {items.query.section === 'regions' ? (
        <RegionOverviewTable label="Country" rows={countries} />
      ) : (
        <>
          <OpenItemsList
            data={items}
            emptyBanner="All clear. Every region has someone looking after it."
          />
          {spamSignups && (
            <p className={styles.closingNote}>
              {spamSignups.text} ·{' '}
              <Link href={spamSignups.href} prefetch={false}>
                View
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
