'use client'

import type { PaginatedDocs } from 'payload'
import type { ReactNode } from 'react'

import { Button, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'

import type { RegionOverviewRow } from '@/lib/atlasOverview/regions'

import styles from './Dashboard.module.css'
import { PAGE_LIMITS } from './model'
import { CenteredNotice } from '../../CenteredNotice'
import { QueryPager } from '../../helpers/listControls'
import { tableColumn } from '../../helpers/tableColumn'

function signupLabel(signups: RegionOverviewRow['signups']): string {
  if (signups.change === 0) return String(signups.last30)
  return `${signups.last30} (${signups.change > 0 ? '+' : ''}${signups.change})`
}

const countPill = (count: number, pillStyle: 'error' | 'warning'): ReactNode =>
  count > 0 ? (
    <Pill pillStyle={pillStyle} rounded size="small">
      {count}
    </Pill>
  ) : (
    '—'
  )

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
  /** A manager's own subtree rather than the top level — shows each row's level. */
  subtree?: boolean
}) {
  const docs = rows.docs

  if (docs.length === 0) {
    return (
      <CenteredNotice title={`No ${label.toLowerCase()} to show`}>
        <p>Regions you look after will appear here once they hold a program.</p>
      </CenteredNotice>
    )
  }

  const column = (
    accessor: string,
    heading: ReactNode,
    cell: (row: RegionOverviewRow) => ReactNode,
  ) => tableColumn(accessor, heading, docs.map(cell))

  return (
    <div className={styles.list}>
      <Table
        columns={[
          column('name', label, (row) => (
            <div className={styles.itemInfo}>
              <Link
                className={styles.stretched}
                href={`?section=regions&region=${row.id}`}
                prefetch={false}
              >
                {row.name}
              </Link>
              {subtree ? <small>{row.level}</small> : null}
            </div>
          )),
          column('managers', 'Managers', (row) => row.managers),
          column('programs', 'Programs', (row) => row.programs),
          column('healthy', 'Healthy', (row) => (row.healthy === null ? '—' : `${row.healthy}%`)),
          column('overdue', 'Overdue', (row) => countPill(row.overdue, 'error')),
          column('unverified', 'Unverified', (row) => countPill(row.unverified, 'warning')),
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
