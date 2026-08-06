import type { PayloadRequest } from 'payload'

/**
 * A shallow copy of `req` to hand to a nested Local API call that reads a
 * **different locale** than the one the caller is operating in.
 *
 * Payload's `createLocalReq` assigns straight onto the request object it's
 * given — `req.locale = localeCandidate` and `req.fallbackLocale = …`
 * (`payload/dist/utilities/createLocalReq.js`). So a nested
 * `payload.findByID({ locale: 'all', req })` doesn't scope that locale to the
 * nested read: it **repoints the caller's own request** at `all` for the rest
 * of its life. Inside a hook that runs during a write, every later step of that
 * write — including the write of a localized field — then runs under the wrong
 * locale, and the value lands somewhere the caller never asked for or is
 * dropped entirely.
 *
 * Copying is enough: the fields that must stay shared are shared by reference.
 * `context` (per-request memoization), `transactionID` (so the nested read joins
 * the same transaction), `user` and `payload` all carry over, so access control
 * and transactional consistency are unaffected — only `locale`/`fallbackLocale`
 * become the copy's own.
 *
 * Not needed when the nested call uses the caller's own locale; only when it
 * deliberately reads another one.
 */
export function localeIsolatedReq(req: PayloadRequest): PayloadRequest {
  return { ...req } as PayloadRequest
}
