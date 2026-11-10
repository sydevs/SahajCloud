import type { MailingListFailure } from './types'

import { transportFailure } from './types'

/**
 * One JSON POST, for an adapter's `subscribe`. Answers the provider's response,
 * or the failure a transport error narrows to.
 *
 * Shared because the mapping is not a per-provider decision, and because the
 * `let response: Response` plus try/catch it replaces was written out in every
 * adapter that posts. What differs stays at the call site: the URL, the auth
 * header, and the body shape.
 *
 * ⚠ **Tell the two arms apart with `'code' in result`, never `instanceof
 * Response`.** Every adapter's suite stubs `fetch` with a plain object carrying
 * `ok`, `status` and `json`, so an instance check reads each of those as a
 * transport failure and the whole lane passes for the wrong reason.
 */
export async function postJson(
  url: string,
  {
    headers,
    body,
    signal,
  }: { headers: Record<string, string>; body: unknown; signal: AbortSignal },
): Promise<Response | MailingListFailure> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    return transportFailure(error)
  }
}

/**
 * A provider's error body as one sentence, falling back to its status line.
 *
 * **Never throws.** This runs on the failure path, and a provider answering
 * something unparseable must not turn a clean 400 into an exception the caller
 * reads as a transport failure.
 *
 * Every vendor nests its message somewhere else, and nothing else about reading
 * one differs — so `parts` is the whole of what an adapter supplies. Non-string
 * and blank entries are dropped, which is how a picker offers a part that may
 * not be there.
 */
export async function providerError<T>(
  response: Response,
  provider: string,
  parts: (body: T) => unknown[],
): Promise<string> {
  try {
    const message = parts((await response.json()) as T)
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(': ')
    if (message !== '') return message
  } catch {
    // Fall through to the status line.
  }
  return `${provider} answered ${response.status}.`
}
