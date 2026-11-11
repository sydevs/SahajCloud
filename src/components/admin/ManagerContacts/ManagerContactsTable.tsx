'use client'

import type { ManagerContactRow } from './data'

import { Table } from '@payloadcms/ui'

import styles from './ManagerContacts.module.css'
import { tableColumn } from '../helpers/tableColumn'

/**
 * Payload's condensed `Table`, as the activity log renders it — the rows and
 * the gate stay on the server (`./data.ts`).
 *
 * The email is a `mailto:` link. It is safe in an `href` because it is the
 * manager's own auth address, which Payload's `email` validator admits, never
 * text a visitor typed.
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
