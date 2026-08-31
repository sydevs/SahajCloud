import { resolveMx } from 'node:dns/promises'

/**
 * Whether the email's domain publishes MX records.
 *
 * - `true` — at least one MX record.
 * - `false` — the domain definitively has none (NXDOMAIN / no data): mail to it
 *   can never be delivered, a strong spam signal.
 * - `null` — unknown (DNS timeout, transient failure, malformed address).
 *   **Fail-open**: availability beats strictness — a resolver hiccup must not
 *   trash a genuine message.
 *
 * **This is a deliberate copy of `ScreenEventSubmissions/emailChecks.ts`, not an
 * oversight.** The two screening jobs are kept independent: they share exactly
 * one step (the email verdict) and nothing after it, and the *wording* of a
 * verdict does not survive the move between them — an event submission's note
 * ends "…and check this event is real", which is meaningless for a message
 * somebody sent us. Extracting a shared `src/lib/screening/` would have coupled
 * two intakes for one DNS primitive.
 *
 * The cost is stated rather than hidden: **an MX-lookup bug must be fixed in
 * both places.** If a third intake ever wants this, that is the moment to
 * promote it to `src/lib/` — three consumers is a shared utility, two is a
 * coincidence.
 */
export async function hasMxRecords(email: string, timeoutMs = 3000): Promise<boolean | null> {
  const domain = email.split('@')[1]?.trim()
  if (!domain) return null

  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
    timer.unref?.()
  })

  try {
    const result = await Promise.race([
      resolveMx(domain).then(
        (records) => records.length > 0,
        (error: NodeJS.ErrnoException) =>
          // Definitive "no such domain / no MX" answers are a real verdict;
          // anything else (SERVFAIL, network) is unknown.
          error.code === 'ENOTFOUND' || error.code === 'ENODATA' ? false : null,
      ),
      timeout,
    ])
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}
