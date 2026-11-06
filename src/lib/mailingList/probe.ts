/**
 * One authenticated GET, for an adapter's `verifyCredentials`. Returns the
 * provider's message, or `null` when it is satisfied.
 *
 * Shared because the status → message mapping is not a per-provider decision: a
 * 401 is a refused credential and a 404 a missing resource, whoever answered.
 * What differs stays in the adapter — the URL, the auth header, and whatever
 * must be checked before a request can be formed at all.
 *
 * `messages` is the two sentences only the caller can write, each defaulting to
 * the single-key provider's. `missing`, because only the caller knows which
 * resource the URL named. `refused`, because a 401 does not always accuse the
 * API key: CleverReach's token has already proved it, so that sentence would
 * send the operator back to a field that is correct. An override either way,
 * so neither case hand-rolls a second status ladder beside this one.
 */
export async function probeCredentials(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  messages: { missing?: string; refused?: string } = {},
): Promise<string | null> {
  const response = await fetch(url, { headers, signal })
  if (response.ok) return null

  if (response.status === 401 || response.status === 403) {
    return messages.refused ?? 'that API key was refused.'
  }
  if (response.status === 404) {
    return messages.missing ?? 'that list id does not exist on this account.'
  }
  // A 5xx is the provider having a bad moment rather than the credential being
  // wrong, so it answers the same "cannot prove it, do not block" the caller's
  // transport catch gives.
  if (response.status >= 500) return null

  return `the provider answered ${response.status}.`
}
