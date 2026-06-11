import type { NotificationChannel, ResolvedRecipient } from './types'
import type { Payload, PayloadRequest } from 'payload'

import type { Event, Manager } from '@/payload-types'

/** Resolve a relationship value (id | populated doc) to its numeric id. */
function toId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'number' ? id : null
  }
  return null
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

/** Collect the managers of every region in an event's breadcrumb chain. */
async function regionChainManagers(
  payload: Payload,
  event: Event,
  req?: PayloadRequest,
): Promise<Manager[]> {
  const regionId = toId(event.region)
  if (!regionId) return []

  // Load the event's region for its ancestor breadcrumb chain (root → self).
  const region = await payload
    .findByID({ collection: 'regions', id: regionId, depth: 0, overrideAccess: true, req })
    .catch(() => null)
  if (!region) return []

  const ancestorIds = Array.isArray(region.breadcrumbs)
    ? region.breadcrumbs.map((crumb) => toId(crumb?.doc)).filter((id): id is number => id !== null)
    : []
  const regionIds = [...new Set([regionId, ...ancestorIds])]

  // Load the whole chain with managers populated (depth 1).
  const { docs: regions } = await payload.find({
    collection: 'regions',
    where: { id: { in: regionIds } },
    depth: 1,
    limit: regionIds.length,
    overrideAccess: true,
    req,
  })

  const managers: Manager[] = []
  for (const chainRegion of regions) {
    for (const manager of chainRegion.managers ?? []) {
      if (typeof manager === 'object' && manager) managers.push(manager)
    }
  }
  return managers
}

/**
 * Resolve the managers to notify for an event, deduped by id and each mapped to
 * a concrete channel + destination. The event manager is always included;
 * `includeRegion` adds the managers of every ancestor region (#476 breadcrumb
 * walk) — the event manager is nudged first, region managers join as expiry
 * nears.
 */
export async function resolveRecipients(args: {
  payload: Payload
  event: Event
  includeRegion: boolean
  req?: PayloadRequest
}): Promise<ResolvedRecipient[]> {
  const { payload, event, includeRegion, req } = args

  const managers: Manager[] = []

  // Event manager (populate if it arrived as a bare id).
  if (typeof event.manager === 'object' && event.manager) {
    managers.push(event.manager)
  } else {
    const managerId = toId(event.manager)
    if (managerId) {
      const manager = await payload
        .findByID({ collection: 'managers', id: managerId, depth: 0, overrideAccess: true, req })
        .catch(() => null)
      if (manager) managers.push(manager)
    }
  }

  if (includeRegion) {
    managers.push(...(await regionChainManagers(payload, event, req)))
  }

  // Dedupe by manager id (first occurrence wins), then map to a channel.
  const seen = new Set<number>()
  const recipients: ResolvedRecipient[] = []
  for (const manager of managers) {
    if (seen.has(manager.id)) continue
    seen.add(manager.id)
    const { channel, destination } = pickChannel(manager)
    recipients.push({ manager, channel, destination })
  }
  return recipients
}
