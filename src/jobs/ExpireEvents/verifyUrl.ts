import { managersLogin } from '@/collections/Managers/login'
import { adminDocPath } from '@/lib/utilities/adminUrl'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { pageLinkUrl, signLinkToken } from '@/plugins/login'

/**
 * The reminder's button, per recipient — a login-plugin page link naming who it
 * signs in, landing on the event's admin page.
 *
 * The event's own manager gets it on the logged-out verify page
 * (`/events/verify?link=`), whose `verifies` claim lets them verify in one
 * click, or sign in to update the details. A region manager does not verify
 * (they may lack the details), so theirs goes through the sign-in page
 * straight to the event.
 *
 * ⚠ **Neither URL does anything on a `GET`.** Both pages read the link and
 * wait for a button's `POST`, so a mail scanner fetching every link in the
 * email verifies nothing and signs nobody in.
 */
export async function reminderButtonUrl({
  event,
  managerId,
  now,
  role,
  secret,
}: {
  event: { id: number; title: string }
  managerId: number
  now: Date
  role: 'manager' | 'region'
  secret: string
}): Promise<string> {
  const page = { label: event.title, to: adminDocPath('events', event.id) }
  if (role === 'region') return pageLinkUrl(managersLogin, managerId, page, secret, now)

  const link = await signLinkToken(
    {
      collection: managersLogin.slug as string,
      issuedAt: now.getTime(),
      userId: managerId,
      ...page,
      verifies: event.id,
    },
    secret,
    now,
  )
  return `${getServerUrl()}/events/verify?link=${encodeURIComponent(link)}`
}
