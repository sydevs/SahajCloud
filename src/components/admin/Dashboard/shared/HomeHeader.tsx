import type { RegionContact } from '../AtlasManager/regionContacts'
import type { ReactNode } from 'react'

import { Button } from '@payloadcms/ui'

import { AskToAddButton } from './AskToAddButton'
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

/**
 * A home's title, subtitle, the public map link and "Add new event" — which
 * creates one with `canCreate`, and otherwise opens `contacts` to ask.
 */
export function HomeHeader({
  canCreate,
  contacts,
  subtitle,
  title,
}: {
  canCreate?: boolean
  /** Who to ask, for a manager who may not create an event themselves. */
  contacts?: RegionContact[]
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
        {canCreate ? (
          <AddProgramButton>Add new event</AddProgramButton>
        ) : contacts?.length ? (
          <AskToAddButton contacts={contacts} />
        ) : null}
      </div>
    </header>
  )
}
