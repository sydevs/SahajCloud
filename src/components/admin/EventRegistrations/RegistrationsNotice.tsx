import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

import { type RecentRegistrations, recentRegistrations } from './data'

const signups = (count: number) => `${count} signup${count === 1 ? '' : 's'}`

/** The banner's headline: the most recent window that saw any signups. */
export function registrationsHeadline({ lastWeek, lastMonth, total }: RecentRegistrations): string {
  if (lastWeek) return `${signups(lastWeek)} in the last week`
  if (lastMonth) return `${signups(lastMonth)} in the last month`
  if (total) return 'No new signups in the last month'
  return 'No signups yet'
}

function registrationsText({ lastWeek, lastMonth, total }: RecentRegistrations): string {
  const listed = 'listed on the Registrations tab, with the answers they gave.'
  if (!total) return `Everyone who signs up for this class will be ${listed}`
  const shown = lastWeek || lastMonth
  if (total === shown) return `Each one is ${listed}`
  const people = total === 1 ? '1 person has' : `${total} people have`
  return `${people} signed up in all, each ${listed}`
}

/**
 * The Registration tab's banner: how many people signed up lately, pointing at
 * the Registrations view that lists them.
 *
 * Nothing for an editor who may not read the signups — anyone but the event's
 * own manager or an admin — since the view it points at would refuse them.
 */
const RegistrationsNotice: UIFieldServerComponent = async ({ id, payload, req }) => {
  if (id == null) return null
  const recent = await recentRegistrations(req, id)
  if (!recent) return null

  const href = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/events/${id}/registrations`,
  })
  return (
    <InfoBanner
      action={{ href, label: 'Open Registrations' }}
      title={registrationsHeadline(recent)}
    >
      {registrationsText(recent)}
    </InfoBanner>
  )
}

export default RegistrationsNotice
