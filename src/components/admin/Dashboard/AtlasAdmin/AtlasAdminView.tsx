'use client'

import type { AtlasAdminData } from './data'

import { Button } from '@payloadcms/ui'
import Link from 'next/link'

import { NAV_LINKS } from '../../AdminNavLinks/links'
import styles from '../shared/Dashboard.module.css'
import { OpenItemsList } from '../shared/OpenItemsList'
import { RegionOverviewTable } from '../shared/RegionOverviewTable'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

/**
 * The admin's home.
 *
 * ⚠ **No meter here.** Progress is a share of somebody's own workload, and an
 * admin's list is what fell through everyone else's — there is no denominator
 * that would make a percentage mean anything.
 */
export function AtlasAdminView({ data }: { data: AtlasAdminData }) {
  const { countries, items, statistics } = data
  const section = items.query.section
  const programs = statistics.analytics[0]?.value ?? 0

  return (
    <section aria-label="Sahaj Atlas overview" className={styles.home}>
      <header className={styles.header}>
        <div>
          <h1>Sahaj Atlas</h1>
          <p className={styles.subtitle}>
            {programs} program{programs === 1 ? '' : 's'} · {data.countryCount} countr
            {data.countryCount === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Button buttonStyle="secondary" el="link" margin={false} url={NAV_LINKS.map.href}>
          {NAV_LINKS.map.label}
        </Button>
      </header>

      <StatTiles label="Verification health" tiles={statistics.health} />

      <SectionTabs
        active={section}
        tabs={[
          { count: items.counts.all, label: 'Open items', value: 'items' },
          { count: null, label: 'Countries overview', value: 'regions' },
        ]}
      />

      {section === 'regions' ? (
        <RegionOverviewTable label="Country" rows={countries} />
      ) : (
        <>
          <OpenItemsList
            data={items}
            emptyBanner="All clear. Every region has someone looking after it."
          />
          {data.refusedAtTheForm === null ? null : (
            <p className={styles.closingNote}>
              {data.refusedAtTheForm} ·{' '}
              <Link href="/admin/collections/registration-refusals" prefetch={false}>
                View
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
