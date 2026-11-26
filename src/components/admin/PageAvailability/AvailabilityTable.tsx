'use client'

import type { AvailabilityRow } from './availability'

import React from 'react'

import { StackedTable } from '@/components/admin/helpers/stackedTable'

import styles from './PageAvailability.module.css'

/**
 * Where the page stands in each service, as one condensed table — the shape the
 * Install tab's progress uses, since both answer "which of these is done" at a
 * glance. A client component only because `StackedTable` is one.
 */
export function AvailabilityTable({ rows }: { rows: AvailabilityRow[] }): React.ReactElement {
  return (
    <StackedTable
      appearance="condensed"
      columns={[
        {
          accessor: 'service',
          cells: rows.map((row) => (
            <span className={styles.service} key={row.service}>
              <span>{row.label}</span>
              {row.note ? <span className={styles.note}>{row.note}</span> : null}
            </span>
          )),
          heading: 'Service',
        },
        {
          accessor: 'status',
          cells: rows.map((row) => (
            <span className={`${styles.status} ${styles[row.tone]}`} key={row.service}>
              {row.status}
            </span>
          )),
          heading: 'Status',
        },
      ]}
      rows={rows.map((row) => ({ id: row.service }))}
    />
  )
}
