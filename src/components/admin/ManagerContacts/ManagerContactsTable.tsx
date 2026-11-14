'use client'

import styles from './ManagerContacts.module.css'
import { type StackedColumn, StackedTable } from '../helpers/stackedTable'

export type ManagerContactTableRow = {
  id: number
  name: string
  email: string
  /** The place they look after. The column shows only where a row names one. */
  region?: string
  /**
   * `null` is a manager who never has. A caller that does not report sign-ins
   * omits the key, and the column goes with it.
   */
  lastSignIn?: { text: string; stale: boolean } | null
}

/**
 * Who to reach and how, as Payload's condensed `Table`. The field description
 * on a region or an event shows it, and so does the modal a class manager is
 * offered in place of a create button they would be refused.
 *
 * The `mailto:` is safe in an `href` because the address passed Payload's
 * `email` validator on the manager's own row.
 */
export function ManagerContactsTable({ rows }: { rows: ManagerContactTableRow[] }) {
  const columns: StackedColumn[] = [
    { accessor: 'name', cells: rows.map((row) => row.name), heading: 'Name' },
  ]

  if (rows.some((row) => row.region !== undefined)) {
    columns.push({
      accessor: 'region',
      cells: rows.map((row) => row.region),
      heading: 'Region',
    })
  }

  columns.push({
    accessor: 'email',
    cells: rows.map((row) => (
      <a key={row.id} href={`mailto:${row.email}`}>
        {row.email}
      </a>
    )),
    heading: 'Email',
  })

  if (rows.some((row) => row.lastSignIn !== undefined)) {
    columns.push({
      accessor: 'lastSignIn',
      cells: rows.map((row) =>
        row.lastSignIn ? (
          <span
            key={row.id}
            className={row.lastSignIn.stale ? `${styles.signIn} ${styles.stale}` : styles.signIn}
          >
            {row.lastSignIn.text}
          </span>
        ) : (
          <span key={row.id} className={styles.never}>
            Never
          </span>
        ),
      ),
      heading: 'Last signed in',
    })
  }

  return (
    <div className={styles.contacts}>
      <StackedTable appearance="condensed" columns={columns} rows={rows} />
    </div>
  )
}
