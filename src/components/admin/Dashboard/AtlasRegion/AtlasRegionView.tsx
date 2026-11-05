'use client'

import type { AtlasRegionHome } from './data'

import { Button, SetStepNav } from '@payloadcms/ui'

import { NAV_LINKS } from '../../AdminNavLinks/links'
import styles from '../shared/Dashboard.module.css'
import { OpenItemsList } from '../shared/OpenItemsList'
import { ProgressMeter } from '../shared/ProgressMeter'
import { RegionOverviewTable } from '../shared/RegionOverviewTable'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

/**
 * A region manager's home, and an admin's view of one region.
 *
 * ⚠ **`SetStepNav` is why this is a client component.** Payload's breadcrumb
 * trail is set through a context the admin shell provides, so there is no
 * server-side equivalent — and a region opened from the overview needs the
 * trail or a reader cannot tell which subtree they are in.
 */
export function AtlasRegionView({ data }: { data: AtlasRegionHome }) {
  const { items, regions, statistics } = data
  const open = items.progress?.open ?? 0
  const section = items.query.section

  return (
    <section aria-label="Your regions" className={styles.home}>
      <SetStepNav nav={data.breadcrumbs} />
      <header className={styles.header}>
        <div>
          <h1>Your regions</h1>
          <p className={styles.subtitle}>{data.description}</p>
        </div>
        <div className={styles.actions}>
          <Button buttonStyle="secondary" el="link" margin={false} url={NAV_LINKS.map.href}>
            {NAV_LINKS.map.label}
          </Button>
          <Button
            el="link"
            icon="plus"
            iconPosition="left"
            margin={false}
            url="/admin/collections/events/create"
          >
            Add new program
          </Button>
        </div>
      </header>

      <StatTiles label="Verification health" tiles={statistics.health} />
      <StatTiles label="The last 30 days" tiles={statistics.analytics} />

      <SectionTabs
        active={section}
        tabs={[
          { count: open, label: 'Open items', value: 'items' },
          { count: null, label: 'Regions overview', value: 'regions' },
        ]}
      />

      {section === 'regions' ? (
        <RegionOverviewTable label="Region" rows={regions} subtree />
      ) : (
        <>
          {items.progress ? <ProgressMeter progress={items.progress} /> : null}
          <OpenItemsList
            data={items}
            emptyBanner="All clear. Every program in your regions is on track."
            open={open}
            showMine
          />
        </>
      )}
    </section>
  )
}
