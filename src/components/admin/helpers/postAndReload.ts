/**
 * POST `endpoint`, then load `to`. Answers `false` when the request failed, so
 * the caller keeps its own busy state and its own failure copy.
 *
 * ⚠ **A full page load, never a router push.** Both callers change who is
 * signed in, and Payload's auth provider reads the user once, when the admin
 * mounts — so the provider and the server-rendered nav must both start again
 * from the new one.
 */
export async function postAndReload(endpoint: string, to: string): Promise<boolean> {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'include' }).catch(
    () => null,
  )
  if (!response?.ok) return false
  window.location.assign(to)
  return true
}
