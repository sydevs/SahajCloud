import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Absolute URL for a registrant's unsubscribe link. Emails can't resolve
 * relative paths, so this resolves against the public origin (`SAHAJCLOUD_URL`
 * in prod). Points at the `/registrations/unsubscribe` confirmation page, which
 * validates the token and offers an explicit "Unsubscribe" button (the mutation
 * runs on that POST, not on opening the link, so an email link-scanner can't
 * auto-unsubscribe). The token encodes the registration, so no id is in the URL.
 */
export function buildUnsubscribeEmailLink(token: string): string {
  return `${getServerUrl()}/registrations/unsubscribe?token=${encodeURIComponent(token)}`
}
