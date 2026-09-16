/**
 * One authenticated GET, for an adapter's `verifyCredentials`. Returns the
 * provider's message, or `null` when it is satisfied.
 *
 * Shared because the status → message mapping is not a per-provider decision: a
 * 401 is a refused key and a 404 a missing list, whoever answered. What differs
 * — the URL, the auth header, and whatever must be checked before a request can
 * be formed at all — stays in the adapter.
 */
export async function probeCredentials(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(url, { headers, signal })
  if (response.ok) return null

  if (response.status === 401 || response.status === 403) {
    return 'that API key was refused.'
  }
  if (response.status === 404) {
    return 'that list id does not exist on this account.'
  }
  // A 5xx is the provider having a bad moment rather than the credential being
  // wrong, so it answers the same "cannot prove it, do not block" the caller's
  // transport catch gives.
  if (response.status >= 500) return null

  return `the provider answered ${response.status}.`
}
