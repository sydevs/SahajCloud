import { resolveMx } from 'node:dns/promises'

/**
 * Whether the email's domain publishes MX records.
 *
 * - `true` — at least one MX record.
 * - `false` — the domain definitively has none (NXDOMAIN / no data): mail to
 *   it can never be delivered, a strong spam signal.
 * - `null` — unknown (DNS timeout, transient failure, malformed address).
 *   **Fail-open**: availability beats strictness — a resolver hiccup must not
 *   trash a genuine submission.
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
