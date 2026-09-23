import { getServerUrl } from '@/lib/utilities/serverUrl'

/** Absolute URL of an event's admin edit page. */
export function eventAdminUrl(eventId: number | string): string {
  return `${getServerUrl()}/admin/collections/events/${eventId}`
}
