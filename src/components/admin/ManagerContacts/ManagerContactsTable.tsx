'use client'

import type { ManagerContactRow } from './data'

import { Table } from '@payloadcms/ui'

import styles from './ManagerContacts.module.css'
import { tableColumn } from '../helpers/tableColumn'

/**
 * Payload's condensed `Table`. The `mailto:` is safe in an `href` because the
 * address passed Payload's `email` validator on the manager's own row.
 */
export function ManagerContactsTable({ rows }: { rows: ManagerContactRow[] }) {
  return (
    <div className={styles.contacts}>
      <Table
        appearance="condensed"
        data={rows}
        columns={[
          tableColumn(
            'name',
            'Name',
            rows.map((row) => <span key={row.id}>{row.name}</span>),
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
          tableColumn(
            'lastSignIn',
            'Last signed in',
            rows.map((row) =>
              row.lastSignIn ? (
                <span
                  key={row.id}
                  className={
                    row.lastSignIn.stale ? `${styles.signIn} ${styles.stale}` : styles.signIn
                  }
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
        ]}
      />
    </div>
  )
}
