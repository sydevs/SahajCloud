import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Absolute URL for the tokenized email verify link. Emails can't resolve
 * relative paths, so this resolves against the public origin (`SAHAJCLOUD_URL`
 * in prod). Hits the GET `/api/events/:id/verify` endpoint, which validates the
 * token and runs the shared verify op while logged out.
 */
export function buildVerifyEmailLink(eventId: number, token: string): string {
  return `${getServerUrl()}/api/events/${eventId}/verify?token=${encodeURIComponent(token)}`
}
