'use client'

import type { PaginatedDocs } from 'payload'
import type { ReactNode } from 'react'

import { Button, ErrorPill, Table, useTranslation } from '@payloadcms/ui'
import { Building2, Globe, type LucideIcon, Map as MapIcon, MapPin } from 'lucide-react'
import Link from 'next/link'

import type { RegionOverviewRow } from '@/lib/atlasOverview/regions'
import { regionLevelLabel } from '@/lib/atlasSidebar/sidebarModel'

import styles from './Dashboard.module.css'
import { IconTip } from './IconTip'
import { PAGE_LIMITS } from './model'
import { CenteredNotice } from '../../CenteredNotice'
import { Count, QueryPager } from '../../helpers/listControls'
import { tableColumn } from '../../helpers/tableColumn'

function signupLabel(signups: RegionOverviewRow['signups']): string {
  if (signups.change === 0) return String(signups.last30)
  return `${signups.last30} (${signups.change > 0 ? '+' : ''}${signups.change})`
}

const LEVEL_ICON: Record<RegionOverviewRow['level'], LucideIcon> = {
  country: Globe,
  region: MapIcon,
  city: Building2,
  venue: MapPin,
}

function managersLabel({ count, names }: RegionOverviewRow['managers']): ReactNode {
  if (count === 0) return '—'
  return (
    <div className={styles.managers}>
      {names.map((name, index) => (
        <span key={index}>{name}</span>
      ))}
      {count > names.length && <span className={styles.muted}>+{count - names.length}</span>}
    </div>
  )
}

/**
 * The Regions overview and the Countries overview — one component, two scopes.
 *
 * ⚠ **Clicking the name opens the region, and Edit opens the record.** The name
 * is a link stretched over its cell (`styles.stretched`; Payload's `td` is
 * positioned) because `Table` exposes nothing per row to attach a click to.
 */
export function RegionOverviewTable({
  label,
  rows,
  subtree,
}: {
  /** What the column of names is called: "Country", or "Region". */
  label: string
  rows: PaginatedDocs<RegionOverviewRow>
  /** A manager's own subtree rather than the top level — marks each row's level. */
  subtree?: boolean
}) {
  const { i18n } = useTranslation()
  const docs = rows.docs

  if (docs.length === 0) {
    return (
      <CenteredNotice title={`No ${label.toLowerCase()} to show`}>
        <p>Regions you look after will appear here once they hold an event.</p>
      </CenteredNotice>
    )
  }

  const column = (
    accessor: string,
    heading: ReactNode,
    cell: (row: RegionOverviewRow) => ReactNode,
  ) => tableColumn(accessor, heading, docs.map(cell))

  return (
    <div className={`${styles.list} ${styles.overview}`}>
      <Table
        columns={[
          column('name', label, (row) => (
            <div className={`${styles.itemInfo} ${styles.titled}`}>
              {subtree ? (
                <IconTip icon={LEVEL_ICON[row.level]} label={regionLevelLabel(row.level)} />
              ) : null}
              <Link
                className={styles.stretched}
                href={`?section=regions&region=${row.id}`}
                prefetch={false}
              >
                {row.name}
              </Link>
            </div>
          )),
          column('managers', 'Managers', (row) => managersLabel(row.managers)),
          column('programs', 'Events', (row) => row.programs),
          column('healthy', 'Healthy', (row) => (row.healthy === null ? '—' : `${row.healthy}%`)),
          column('overdue', 'Overdue', (row) =>
            row.overdue > 0 ? <ErrorPill count={row.overdue} i18n={i18n} /> : '—',
          ),
          column('unverified', 'Unverified', (row) =>
            row.unverified > 0 ? <Count value={row.unverified} /> : '—',
          ),
          column('signups', 'Sign-ups · 30 days', (row) => signupLabel(row.signups)),
          column('edit', <span className="sr-only">Edit</span>, (row) => (
            <Button
              aria-label={`Edit ${row.name}`}
              buttonStyle="secondary"
              el="link"
              margin={false}
              size="small"
              url={`/admin/collections/regions/${row.id}`}
            >
              Edit
            </Button>
          )),
        ]}
        data={docs.map(({ id }) => ({ id }))}
      />
      <QueryPager docs={rows} limits={PAGE_LIMITS} />
    </div>
  )
}
