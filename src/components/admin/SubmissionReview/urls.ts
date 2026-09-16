export type Action = 'accept' | 'reject' | 'reopen' | 'delete'

/**
 * The REST URL an action posts to, or `null` when there is no locale to send.
 *
 * The review op resolves the reviewer's roles at `req.locale`, so the request
 * must name the active admin locale — without it Payload resolves the default
 * locale and denies any manager whose roles live only elsewhere (#701).
 * `useLocale()`'s context default is `{}`, so `code` can be undefined at
 * runtime; interpolating it yields `?locale=undefined`, which `sanitizeLocales`
 * rewrites to the default locale. That reproduces the #701 403 silently, so
 * this refuses to build a URL instead, and the caller reports it.
 *
 * DELETE is not locale-gated today. It carries the locale anyway, so both
 * calls have one shape and one guard.
 */
export const submissionActionUrl = (
  id: string | number,
  action: Action,
  locale: string | undefined,
): string | null => {
  if (!locale) return null
  const query = `?locale=${encodeURIComponent(locale)}`
  return action === 'delete'
    ? `/api/user-submissions/${id}${query}`
    : `/api/user-submissions/${id}/review${query}`
}
