'use client'

import type { RegionContact } from './regionContacts'

import { Button, Modal, useModal } from '@payloadcms/ui'

import { ManagerContactsTable } from '../../ManagerContacts/ManagerContactsTable'

const MODAL_SLUG = 'atlas-ask-to-add'

/**
 * "Add new event" for a manager who may not create one. It opens the people to
 * ask rather than a create screen the server would refuse.
 *
 * A modal rather than a drawer: the list is a handful of names, and this is a
 * notice about who to reach, not a surface to work in. `confirmation-modal` is
 * Payload's own layout for that, as `SecretField` uses it.
 */
export function AskToAddButton({ contacts }: { contacts: RegionContact[] }) {
  const { closeModal, isModalOpen, openModal } = useModal()

  return (
    <>
      <Button icon="plus" iconPosition="left" margin={false} onClick={() => openModal(MODAL_SLUG)}>
        Add new event
      </Button>
      <Modal className="confirmation-modal" slug={MODAL_SLUG}>
        {isModalOpen(MODAL_SLUG) ? (
          <div className="confirmation-modal__wrapper">
            <div className="confirmation-modal__content">
              <h1>Add new event</h1>
              <p>
                Events can only be created by regional managers. Contact one of these yogis who
                manage the events in your area:
              </p>
            </div>
            <ManagerContactsTable
              rows={contacts.map(({ email, id, name, region }) => ({
                email,
                id,
                name,
                subtitle: region,
              }))}
            />
            <div className="confirmation-modal__controls">
              <Button buttonStyle="secondary" onClick={() => closeModal(MODAL_SLUG)} size="large">
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
