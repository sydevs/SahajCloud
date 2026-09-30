import { managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { REDEEM_PATH } from '@/plugins/login'

/**
 * Where a confirmation form posts to spend a delivered link — any kind, since
 * the redeem route reads the kind off the token itself. The `POST` is what
 * spends it.
 *
 * Shared by the sign-in page and the event verify page, whose "Update the
 * details" button spends a page link too. The path comes from the endpoint
 * definition rather than a literal, so a rename cannot leave one behind.
 */
export const redeemUrl = (token: string) =>
  `${getServerUrl()}/api/${managersLogin.slug}${REDEEM_PATH}?token=${encodeURIComponent(token)}`
