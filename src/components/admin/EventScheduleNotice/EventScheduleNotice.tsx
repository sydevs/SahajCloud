'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { ScheduleSummary } from '@/components/admin/ScheduleSummary'
import { hasContactRoute } from '@/lib/events/contactRoute'

/**
 * The head of an event's Schedule tab: the schedule in a sentence, or — for an
 * on-demand class, which has none — whether a seeker can reach anyone, with a
 * way to the contact fields.
 *
 * Reads live form state, so it answers for the choice just made, unsaved.
 */
export function EventScheduleNotice(): React.ReactElement | null {
  const onDemand = useFormFields(([fields]) => fields.inactive?.value === true)
  if (onDemand) return <OnDemandContactNotice />
  return <ScheduleSummary path="schedule" />
}

function OnDemandContactNotice() {
  const { value: allowContact, setValue: setAllowContact } = useField<boolean>({
    path: 'allowContact',
  })
  const reachable = useFormFields(([fields]) =>
    hasContactRoute({
      contactEmail: fields.contactEmail?.value,
      contactPhone: fields.contactPhone?.value,
    }),
  )
  const name = useFormFields(([fields]) => fields.contactName?.value)

  const openContact = (event: React.MouseEvent<Element>) => {
    if (!allowContact) setAllowContact(true)
    revealField(event.currentTarget.closest('form'), 'Details', 'allowContact')
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
 * Switch the notice's own form to another tab and bring one of its fields into
 * view — its own form, since an event opened in a drawer sits over another
 * document's tabs.
 *
 * shortcut: Payload's `Tabs` field keeps its active tab in component state and
 * exposes no way to set it, so this clicks the tab's own button. Upgrade if
 * Payload ships a tab API or URL-addressable tabs.
 */
function revealField(form: HTMLFormElement | null, tabLabel: string, fieldName: string) {
  if (!form) return
  // The label is the button's first text: a refused save adds an error count after it.
  Array.from(form.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button'))
    .find((button) => button.firstChild?.textContent?.trim() === tabLabel)
    ?.click()
  // The tab mounts its fields after the click; give them a few frames.
  let attempts = 0
  const scroll = () => {
    // A drawer suffixes each field id with its depth.
    const target = form.querySelector<HTMLElement>(`[id^="field-${fieldName}"]`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
    } else if (++attempts < 20) requestAnimationFrame(scroll)
  }
  requestAnimationFrame(scroll)
}

export default EventScheduleNotice
