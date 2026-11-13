'use client'

import type { RegionContact } from './regionContacts'

import { Button, Drawer, useDrawerSlug, useModal } from '@payloadcms/ui'

import { ManagerContactsTable } from '../../ManagerContacts/ManagerContactsTable'
import styles from '../shared/Dashboard.module.css'

/**
 * "Add new event" for a manager who may not create one. It opens the people to
 * ask rather than a create screen the server would refuse.
 */
export function AskToAddButton({ contacts }: { contacts: RegionContact[] }) {
  const drawerSlug = useDrawerSlug('atlas-ask-to-add')
  const { openModal } = useModal()

  return (
    <>
      <Button icon="plus" iconPosition="left" margin={false} onClick={() => openModal(drawerSlug)}>
        Add new event
      </Button>
      {/* Mounted unconditionally, or it opens already open and never slides —
          `Drawer` seeds `animateIn` from the modal state at mount. */}
      <Drawer slug={drawerSlug} title="Add new event">
        <p className={styles.subtitle}>
          Your events are added by the managers who look after your regions. Ask one of them — the
          nearest is first.
        </p>
        <ManagerContactsTable
          rows={contacts.map(({ email, id, name, region }) => ({
            email,
            id,
            name,
            subtitle: region,
          }))}
        />
      </Drawer>
    </>
  )
}
