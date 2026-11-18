import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

import { type RecentRegistrations, recentRegistrations } from './data'

const signups = (count: number) => `${count} signup${count === 1 ? '' : 's'}`

/** The most recent window that saw any signups. */
function headline({ lastWeek, lastMonth }: RecentRegistrations): string {
  if (lastWeek) return `${signups(lastWeek)} in the last week`
  if (lastMonth) return `${signups(lastMonth)} in the last month`
  return 'No signups in the last month'
}

/**
 * The Registration tab's banner: how many people signed up lately, pointing at
 * the Registrations view that lists them.
 *
 * Nothing for an editor who may not read the signups — anyone but the event's
 * own manager or an admin — since the view it points at would refuse them.
 */
const RegistrationsNotice: UIFieldServerComponent = async ({ id, payload, req }) => {
  const recent = await recentRegistrations(req, id ?? undefined)
  if (!recent) return null

  const href = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/events/${id}/registrations`,
  })
  return (
    <InfoBanner action={{ href, label: 'Open Registrations' }} title={headline(recent)}>
      Everyone who signs up is listed on the Registrations tab, with the answers they gave.
    </InfoBanner>
  )
}

export default RegistrationsNotice
