'use client'

import { Table } from '@payloadcms/ui'

import styles from './ManagerContacts.module.css'
import { tableColumn } from '../helpers/tableColumn'

export type ManagerContactTableRow = {
  id: number
  name: string
  email: string
  /**
   * A second line under the name, for the place they look after. It goes there
   * rather than in a column of its own because a third column puts the email
   * off a phone's screen.
   */
  subtitle?: string
  /**
   * `null` is a manager who never has. A caller that does not report sign-ins
   * omits the key, and the column goes with it.
   */
  lastSignIn?: { text: string; stale: boolean } | null
}

/**
 * Who to reach and how, as Payload's condensed `Table`. The field description
 * on a region or an event shows it, and so does the drawer a class manager is
 * offered in place of a create button they would be refused.
 *
 * The `mailto:` is safe in an `href` because the address passed Payload's
 * `email` validator on the manager's own row.
 */
export function ManagerContactsTable({ rows }: { rows: ManagerContactTableRow[] }) {
  const columns = [
    tableColumn(
      'name',
      'Name',
      rows.map((row) => (
        <div key={row.id}>
          {row.name}
          {row.subtitle ? <span className={styles.subtitle}>{row.subtitle}</span> : null}
        </div>
      )),
    ),
    tableColumn(
      'email',
      'Email',
      rows.map((row) => (
        <a key={row.id} href={`mailto:${row.email}`}>
          {row.email}
        </a>
      )),
    ),
  ]

  if (rows.some((row) => row.lastSignIn !== undefined)) {
    columns.push(
      tableColumn(
        'lastSignIn',
        'Last signed in',
        rows.map((row) =>
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
      ),
    )
  }

  return (
    <div className={styles.contacts}>
      <Table appearance="condensed" data={rows.map(({ id }) => ({ id }))} columns={columns} />
    </div>
  )
}
