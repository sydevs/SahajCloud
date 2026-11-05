/**
 * One authenticated GET, for an adapter's `verifyCredentials`. Returns the
 * provider's message, or `null` when it is satisfied.
 *
 * Shared because the status → message mapping is not a per-provider decision: a
 * 401 is a refused key and a 404 a missing resource, whoever answered. What
 * differs — the URL, the auth header, and whatever must be checked before a
 * request can be formed at all — stays in the adapter.
 *
 * `missing` is the one message only the caller can write, because only it knows
 * which resource the URL named. A caller reading something other than a list
 * passes its own, rather than hand-rolling a second status ladder beside this
 * one.
 */
export async function probeCredentials(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  missing = 'that list id does not exist on this account.',
): Promise<string | null> {
  const response = await fetch(url, { headers, signal })
  if (response.ok) return null

  if (response.status === 401 || response.status === 403) {
    return 'that API key was refused.'
  }
  if (response.status === 404) return missing
  // A 5xx is the provider having a bad moment rather than the credential being
  // wrong, so it answers the same "cannot prove it, do not block" the caller's
  // transport catch gives.
  if (response.status >= 500) return null

  return `the provider answered ${response.status}.`
}
