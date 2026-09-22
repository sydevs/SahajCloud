/**
 * The `submissionData` keys the **client** writes about itself, rather than
 * answers a visitor typed.
 *
 * Two owners, which is why this is not in either of them: `UserSubmissions`
 * derives `URL_EXEMPT_KEYS` from it — a crash report names the page it happened
 * on, and a host URL *is* a URL — and `Forms` refuses a field named after one,
 * because the context is appended after the answers, so the visitor's answer
 * would be silently replaced.
 *
 * ⚠ **Deliberately not all of `BASE_SUBMISSION_KEYS`.** `name` and `subject`
 * are real questions the production Contact Form asks, and the intake *reads*
 * those answers (`upsertUserByEmail`, `composeSubject`) rather than overwriting
 * them. Reserving them would make that form unsaveable.
 */
export const CLIENT_CONTEXT_KEYS = ['locale', 'path', 'hostUrl', 'userAgent', 'error'] as const
