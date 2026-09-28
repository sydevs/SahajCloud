import { managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { REDEEM_INVITE_PATH, REDEEM_LINK_PATH, REDEEM_MAGIC_LINK_PATH } from '@/plugins/login'

/**
 * Where each confirmation form posts. The `POST` is what spends the link.
 *
 * Shared by the sign-in page and the event verify page, whose "Update the
 * details" button spends a page link too.
 *
 * ⚠ **Its own module so it can be pinned.** The pages are async server
 * components reaching for `getPayload`, so no spec renders them — and the
 * routes differ by one word. Sending an invitation to the sign-in route (or the
 * reverse) is refused for a wrong audience, which reads to the holder as "this
 * link is not valid", with nothing failing anywhere. The paths come from the
 * endpoint definitions rather than a literal, so a rename cannot leave one
 * behind.
 */
const redeemAt = (path: string, token: string) =>
  `${getServerUrl()}/api/${managersLogin.slug}${path}?token=${encodeURIComponent(token)}`

/** A delivered sign-in link. */
export const redeemUrl = (token: string) => redeemAt(REDEEM_MAGIC_LINK_PATH, token)

/** A delivered invitation. A separate audience, so a separate route (#839). */
export const acceptUrl = (token: string) => redeemAt(REDEEM_INVITE_PATH, token)

/** A delivered page link — a reminder's, landing on the event it names. */
export const openUrl = (token: string) => redeemAt(REDEEM_LINK_PATH, token)
