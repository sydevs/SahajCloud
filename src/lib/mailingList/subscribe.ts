import type { MailingListConfig, MailingListResult, SubscribeArgs } from './types'

import { adapterFor, unknownProviderMessage } from './providers'
import { PROVIDER_TIMEOUT_MS } from './types'

/**
 * Whether a client's list is usable at all — the one definition, so the
 * delivery job and the save-time validator agree on what "configured" means.
 *
 * All three credentials are `required` on the field while `enabled` is on, so
 * this is belt-and-braces for a row written before the group existed, or one an
 * `overrideAccess` writer assembled by hand.
 */
export function isMailingListConfigured(
  config: MailingListConfig | null | undefined,
): config is MailingListConfig & { provider: string; listId: string; apiKey: string } {
  return Boolean(config?.enabled && config.provider && config.listId && config.apiKey)
}

/**
 * Push one address to whichever provider a client has configured.
 *
 * The lookup is the whole of this function: every provider difference — opt-in
 * model, error vocabulary, whether a repeat address is an error — belongs in
 * its own `MailingListAdapter`, and the `MailingListResult` union is what they
 * agree on. A caller branches on the union, never on `config.provider`.
 *
 * ⚠ **This performs no captcha or origin check**, by design. It runs behind an
 * intake that has already passed both, from a job in which no caller is
 * waiting. Putting the guards here would charge the internal caller twice for
 * checks the request path already made.
 */
export async function subscribeToMailingList(
  args: Omit<SubscribeArgs, 'signal'> & { signal?: AbortSignal },
): Promise<MailingListResult> {
  const { config } = args

  if (!isMailingListConfigured(config)) {
    return {
      ok: false,
      code: 'not_configured',
      message: 'This service has no mailing list configured.',
      // Terminal: a job retrying this would call nothing, three times.
      retryable: false,
    }
  }

  const adapter = adapterFor(config.provider)
  if (!adapter) {
    // Unreachable through the select, and deliberately not a throw: a row
    // carrying a provider this build does not know is a configuration fact, and
    // the delivery job records facts rather than crashing on them.
    return {
      ok: false,
      code: 'not_configured',
      message: unknownProviderMessage(config.provider),
      retryable: false,
    }
  }

  const signal = args.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  return adapter.subscribe({ ...args, config, signal })
}
