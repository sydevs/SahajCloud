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
 * **Promoted here from the two screening jobs, on their own terms.** Each kept a
 * byte-identical copy while there were two, because the *wording* of a verdict
 * did not survive the move between them and one DNS primitive was not worth
 * coupling two intakes over. Their shared docblock named the trigger for
 * changing that: "if a third intake ever wants this, that is the moment to
 * promote it — three consumers is a shared utility, two is a coincidence."
 * `ScreenSubmissions` is the third, so this is that moment.
 *
 * It sits in `antiSpam/` rather than a new folder: it is one of the public-write
 * checks, alongside `checkEmailAllowed`, which every caller here runs beside it.
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
