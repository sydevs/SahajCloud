'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { ScheduleSummaryBanner } from '@/components/admin/ScheduleSummary'

/**
 * The head of an event's Schedule tab: the schedule in a sentence, or — for an
 * on-demand class, which has none — whether a seeker can reach anyone, with a
 * way to the contact fields.
 *
 * Reads live form state, so it answers for the choice just made, unsaved.
 */
export function EventScheduleNotice(): React.ReactElement | null {
  const repeats = useFormFields(([fields]) => fields.repeats?.value)
  if (repeats === 'inactive') return <OnDemandContactNotice />
  return <ScheduleSummaryBanner recurrenceFrom="repeats" schedulePath="schedule" />
}

function OnDemandContactNotice() {
  const { value: allowContact, setValue: setAllowContact } = useField<boolean>({
    path: 'allowContact',
  })
  const reachable = useFormFields(([fields]) =>
    Boolean(fields.contactPhone?.value || fields.contactEmail?.value),
  )
  const name = useFormFields(([fields]) => fields.contactName?.value)

  const openContact = () => {
    if (!allowContact) setAllowContact(true)
    revealField('Details', 'field-allowContact')
  }

  if (!allowContact || !reachable) {
    return (
      <InfoBanner
        action={{ label: 'Add contact details', onClick: openContact }}
        title="Add a public contact"
        type="warning"
      >
        An on-demand class has no schedule to show, so a phone number or an email address is the
        only way seekers can reach you. It can&rsquo;t be saved without one.
      </InfoBanner>
    )
  }

  return (
    <InfoBanner
      action={{ label: 'Edit public contact', onClick: openContact }}
      title={`Seekers will contact ${typeof name === 'string' && name ? name : 'you'} to arrange a time`}
    >
      The listing shows your public contact in place of a schedule.
    </InfoBanner>
  )
}

/**
 * Switch to another tab of the form and bring one of its fields into view.
 *
 * shortcut: Payload's `Tabs` field keeps its active tab in component state and
 * exposes no way to set it, so this clicks the tab's own button. Upgrade if
 * Payload ships a tab API or URL-addressable tabs.
 */
function revealField(tabLabel: string, fieldId: string) {
  Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button'))
    .find((button) => button.textContent?.trim() === tabLabel)
    ?.click()
  // The tab mounts its fields after the click; give them a few frames.
  let attempts = 0
  const scroll = () => {
    const target = document.getElementById(fieldId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
    } else if (++attempts < 20) requestAnimationFrame(scroll)
  }
  requestAnimationFrame(scroll)
}

export default EventScheduleNotice
