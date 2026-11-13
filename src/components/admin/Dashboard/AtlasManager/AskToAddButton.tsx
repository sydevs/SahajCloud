'use client'

import type { RegionContact } from './regionContacts'

import { Button, Drawer, Table, useDrawerSlug, useModal } from '@payloadcms/ui'

import { tableColumn } from '../../helpers/tableColumn'
import styles from '../shared/Dashboard.module.css'

/**
 * "Add new event" for a manager who may not create one. It opens the people to
 * ask rather than a create screen the server would refuse.
 *
 * The `mailto:` is safe in an `href` because each address passed Payload's
 * `email` validator on the manager's own row.
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
        <Table
          appearance="condensed"
          data={contacts.map(({ id }) => ({ id }))}
          columns={[
            // The region sits under the name rather than in a column of its
            // own: a third column puts the email off a phone's screen.
            tableColumn(
              'name',
              'Name',
              contacts.map((contact) => (
                <div key={contact.id}>
                  {contact.name}
                  <span className={styles.itemSubtitle}>{contact.region}</span>
                </div>
              )),
            ),
            tableColumn(
              'email',
              'Email',
              contacts.map((contact) => (
                <a href={`mailto:${contact.email}`} key={contact.id}>
                  {contact.email}
                </a>
              )),
            ),
          ]}
        />
      </Drawer>
    </>
  )
}
