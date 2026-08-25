import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Absolute URL for the tokenized email verify link. Emails can't resolve
 * relative paths, so this resolves against the public origin (`SAHAJCLOUD_URL`
 * in prod). Points at the `/events/verify` confirmation page, which validates
 * the token and offers an explicit "Verify this event" button (the mutation
 * runs on that POST, not on opening the link). The token already encodes the
 * event + manager, so no id is needed in the URL.
 */
export function buildVerifyEmailLink(token: string): string {
  return `${getServerUrl()}/events/verify?token=${encodeURIComponent(token)}`
}
