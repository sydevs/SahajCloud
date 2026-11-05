'use client'

import type { PaginatedDocs } from 'payload'

import { Button, Pagination, PerPage, Pill } from '@payloadcms/ui'
import Link from 'next/link'

import type { RegionOverviewRow } from '@/lib/atlasOverview/regions'

import styles from './Dashboard.module.css'
import { type DashboardQuery, PAGE_LIMITS } from './model'
import { CenteredNotice } from '../../CenteredNotice'
import { useSetQuery } from '../../helpers/useSetQuery'

function signupLabel(signups: RegionOverviewRow['signups']): string {
  if (signups.change === 0) return String(signups.last30)
  return `${signups.last30} (${signups.change > 0 ? '+' : ''}${signups.change})`
}

/**
 * The Regions overview and the Countries overview — one component, two scopes.
 *
 * ⚠ **Clicking the row opens it, and Edit opens the record.** Two
 * destinations in one row, so the name is a stretched link covering the cell
 * (`styles.stretched`) while Edit stays a button of its own. A whole-row
 * `onClick` would have swallowed the Edit click, and Payload's `Table` exposes
 * nothing per row to attach one to anyway (`docs/rules/admin-ui.md`).
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
  const setQuery = useSetQuery<DashboardQuery>()
  const docs = rows.docs

  if (docs.length === 0) {
    return (
      <CenteredNotice title={`No ${label.toLowerCase()} to show`}>
        <p>Regions you look after will appear here once they hold a program.</p>
      </CenteredNotice>
    )
  }

  return (
    <div className={styles.list}>
      <table className={styles.regions}>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Managers</th>
            <th scope="col">Programs</th>
            <th scope="col">Healthy</th>
            <th scope="col">Overdue</th>
            <th scope="col">Unverified</th>
            <th scope="col">Sign-ups · 30 days</th>
            <th scope="col">
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((row) => (
            <tr key={row.id}>
              <th className={styles.regionName} scope="row">
                <Link
                  className={styles.stretched}
                  href={`?section=regions&region=${row.id}`}
                  prefetch={false}
                >
                  {row.name}
                </Link>
                {subtree ? <small>{row.level}</small> : null}
              </th>
              <td>{row.managers}</td>
              <td>{row.programs}</td>
              <td>{row.healthy === null ? '—' : `${row.healthy}%`}</td>
              <td>
                {row.overdue > 0 ? (
                  <Pill pillStyle="error" rounded size="small">
                    {row.overdue}
                  </Pill>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {row.unverified > 0 ? (
                  <Pill pillStyle="warning" rounded size="small">
                    {row.unverified}
                  </Pill>
                ) : (
                  '—'
                )}
              </td>
              <td>{signupLabel(row.signups)}</td>
              <td>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.pageControls}>
        <Pagination
          hasNextPage={rows.hasNextPage}
          hasPrevPage={rows.hasPrevPage}
          nextPage={rows.nextPage ?? undefined}
          onChange={(page) => setQuery({ page })}
          page={rows.page}
          prevPage={rows.prevPage ?? undefined}
          totalPages={rows.totalPages}
        />
        {rows.totalDocs > PAGE_LIMITS[0]! && (
          <PerPage
            handleChange={(limit) => setQuery({ limit, page: 1 })}
            limit={rows.limit}
            limits={PAGE_LIMITS}
          />
        )}
      </div>
    </div>
  )
}
