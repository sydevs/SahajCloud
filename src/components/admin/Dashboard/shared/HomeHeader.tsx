import type { ReactNode } from 'react'

import { Button } from '@payloadcms/ui'

import styles from './Dashboard.module.css'
import { NAV_LINKS } from '../../AdminNavLinks/links'

export function AddProgramButton({ children }: { children: ReactNode }) {
  return (
    <Button
      el="link"
      icon="plus"
      iconPosition="left"
      margin={false}
      url="/admin/collections/events/create"
    >
      {children}
    </Button>
  )
}

/** A home's title, subtitle, the public map link and, with `canCreate`, "Add new program". */
export function HomeHeader({
  canCreate,
  subtitle,
  title,
}: {
  canCreate?: boolean
  subtitle: ReactNode
  title: string
}) {
  return (
    <header className={styles.header}>
      <div>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.actions}>
        <Button buttonStyle="secondary" el="link" margin={false} url={NAV_LINKS.map.href}>
          {NAV_LINKS.map.label}
        </Button>
        {canCreate && <AddProgramButton>Add new program</AddProgramButton>}
      </div>
    </header>
  )
}
