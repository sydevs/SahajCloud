import { isRecord } from '@/lib/utilities/isRecord'

/** A Payload REST list response, read for its documents alone. */
export type PayloadList<T> = { docs?: T[] }

/**
 * One admin list read: `GET` a Payload REST list, or throw.
 *
 * Every refusal throws, carrying the server's **own** `errors[0].message` where
 * one is sent — a component telling the reader why it is empty has nothing else
 * to say, and a status code alone names the wrong layer. A caller that would
 * rather render a placeholder catches it; one that would rather explain itself
 * shows the message.
 *
 * `!response.ok` is the whole refusal test. A list `GET` never answers 201, so
 * the `status > 201` one caller used agrees with this on every real response.
 *
 * An unparsable success body throws too, rather than resolving to nothing: a
 * caller waiting on `docs` cannot tell "no list" from "not yet" and would keep
 * its spinner up for good.
 */
export async function payloadListFetcher<T>(url: string): Promise<PayloadList<T>> {
  const response = await fetch(url, { credentials: 'include' })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message
    throw new Error(message ?? `The server answered ${response.status}.`)
  }
  if (!isRecord(body)) throw new Error(`The server answered ${response.status} with no list.`)

  return body as PayloadList<T>
}
