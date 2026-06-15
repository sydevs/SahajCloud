import type { EventManagerContact, NotificationChannel, ResolvedRecipient } from './types'
import type { Payload, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { relationId } from '@/lib/utilities/relationId'
import type { Event, Manager } from '@/payload-types'

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  wechat: 'WeChat',
}

/** The manager's name + every contact method (email + messaging handles). */
export function buildManagerContacts(manager: Manager): EventManagerContact {
  const contacts: { label: string; value: string }[] = []
  if (manager.email) contacts.push({ label: 'Email', value: manager.email })
  for (const entry of manager.contactDetails ?? []) {
    if (entry?.platform && entry?.identifier) {
      contacts.push({
        label: PLATFORM_LABELS[entry.platform] ?? entry.platform,
        value: entry.identifier,
      })
    }
  }
  return { name: manager.name || manager.email || `#${manager.id}`, contacts }
}

/**
 * Pick the delivery channel + destination for a manager from their
 * `event_verification.method`. A platform method (whatsapp/telegram/wechat)
 * resolves to the matching `contactDetails` handle; anything else — including
 * an unset method or a platform with no handle on file — falls back to email.
 */
export function pickChannel(manager: Manager): {
  channel: NotificationChannel
  destination: string
} {
  const prefs = manager.notificationPreferences as
    | Record<string, { method?: string } | undefined>
    | null
    | undefined
  const method = prefs?.event_verification?.method

  if (method === 'whatsapp' || method === 'telegram' || method === 'wechat') {
    const contact = (manager.contactDetails ?? []).find(
      (entry) => entry?.platform === method && entry?.identifier,
    )
    if (contact?.identifier) {
      return { channel: method, destination: contact.identifier }
    }
  }

  return { channel: 'email', destination: manager.email ?? '' }
}

/**
 * Find the region manager to escalate to: the first manager up the region
 * parent chain (nearest region first) who is NOT the event manager — so we
 * never email the same person twice. Returns that manager plus the name of the
 * region that links them to the event, or `null` if no distinct manager exists
 * anywhere up the chain.
 */
async function findRegionRecipient(
  payload: Payload,
  event: Event,
  eventManagerId: number | null,
  req?: PayloadRequest,
): Promise<{ manager: Manager; regionName: string } | null> {
  const regionId = relationId(event.region)
  if (!regionId) return null

  // Reuse the already-populated region's breadcrumbs (the job loads events at
  // depth 1); fetch only when region arrived as a bare id.
  const eventRegion =
    typeof event.region === 'object' && event.region && Array.isArray(event.region.breadcrumbs)
      ? event.region
      : await payload
          .findByID({ collection: 'regions', id: regionId, depth: 0, overrideAccess: true, req })
          .catch(() => null)

  const breadcrumbIds = Array.isArray(eventRegion?.breadcrumbs)
    ? eventRegion.breadcrumbs
        .map((crumb) => relationId(crumb?.doc))
        .filter((id): id is number => id !== null)
    : []
  // Nearest region first (the event's own region), then up to the country.
  const chainIds = [...new Set([regionId, ...breadcrumbIds.reverse()])]

  const { docs: regions } = await payload.find({
    collection: 'regions',
    where: { id: { in: chainIds } },
    depth: 1,
    limit: chainIds.length,
    overrideAccess: true,
    req,
  })
  const byId = new Map(regions.map((region) => [region.id, region]))

  for (const id of chainIds) {
    const region = byId.get(id)
    if (!region) continue
    for (const manager of region.managers ?? []) {
      if (typeof manager === 'object' && manager && manager.id !== eventManagerId) {
        return { manager, regionName: region.name }
      }
    }
  }
  return null
}

/**
 * Resolve who to notify for an event. The event manager is always included
 * (role `manager`). When `includeRegion` is set (from `escalated` onward), a
 * single region manager — the nearest one up the parent chain who is NOT the
 * event manager — is added (role `region`, tagged with the linking region's
 * name). If no distinct region manager exists anywhere up the chain, a warning
 * is sent to Sentry and only the event manager is returned.
 */
export async function resolveRecipients(args: {
  payload: Payload
  event: Event
  includeRegion: boolean
  req?: PayloadRequest
}): Promise<ResolvedRecipient[]> {
  const { payload, event, includeRegion, req } = args
  const recipients: ResolvedRecipient[] = []

  // Event manager (populate if it arrived as a bare id).
  let eventManager: Manager | null = null
  if (typeof event.manager === 'object' && event.manager) {
    eventManager = event.manager
  } else {
    const managerId = relationId(event.manager)
    if (managerId) {
      eventManager = await payload
        .findByID({ collection: 'managers', id: managerId, depth: 0, overrideAccess: true, req })
        .catch(() => null)
    }
  }
  if (eventManager) {
    const { channel, destination } = pickChannel(eventManager)
    recipients.push({ manager: eventManager, role: 'manager', channel, destination })
  }

  if (includeRegion) {
    const region = await findRegionRecipient(payload, event, eventManager?.id ?? null, req)
    if (region) {
      const { channel, destination } = pickChannel(region.manager)
      recipients.push({
        manager: region.manager,
        role: 'region',
        channel,
        destination,
        regionName: region.regionName,
      })
    } else {
      const message =
        'ExpireEvents: no region manager (distinct from the event manager) found to escalate to'
      const extra = {
        eventId: event.id,
        regionId: relationId(event.region),
        eventManagerId: eventManager?.id ?? null,
      }
      payload.logger.warn({ msg: message, ...extra })
      Sentry.captureMessage(message, { level: 'warning', extra })
    }
  }

  return recipients
}
