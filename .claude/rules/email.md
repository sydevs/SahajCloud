---
paths:
  - src/plugins/email/**/*.ts
  - src/emails/**/*.tsx
---

# Email Configuration

The application uses different email providers based on environment:

| Environment | Provider | Notes |
|---|---|---|
| Development | Ethereal Email (auto, via `@payloadcms/email-nodemailer`) | Captures outbound mail at https://ethereal.email — credentials printed to console. From `dev@wemeditate.com`. |
| Production | Resend (transactional API) | Custom adapter at `src/plugins/email/resendAdapter.ts`. From `contact@sydevelopers.com`. Free tier 3,000 emails/month. |
| Test | Disabled | Prevents Payload model conflicts during parallel test execution. Test email logic separately, without full Payload init. |

## Resend adapter

- Implements PayloadCMS `EmailAdapter`.
- **Graceful fallback**: missing `RESEND_API_KEY` → logs error, returns error
  message ID (no throw).
- All operations are logged for debugging.
- Adapter selection in `src/payload.config.ts` is keyed on `NODE_ENV`.

### It hand-maps the message — anything unmapped is silently dropped

Payload's `SendEmailOptions` is nodemailer-shaped, but the adapter translates it
field by field into Resend's REST payload. A field it doesn't map doesn't error
— it just never arrives. That's how `attachments` and `replyTo` went missing
until #582. **When a template needs a new message field, add it to the mapping
and pin it in `tests/unit/resend-adapter.spec.ts`.**

Currently mapped: `from`, `to`, `subject`, `html`, `text`, `replyTo`,
`attachments`.

- `attachments` narrows to a string/Buffer `content` (or a hosted `path`).
  nodemailer also permits a `Readable`, which the Resend REST API cannot accept;
  streams are dropped with a warning rather than sent as a payload that 422s.
- `replyTo` flattens nodemailer's `Address` objects to the plain strings Resend
  takes.

The dev **nodemailer/Ethereal** adapter needs no equivalent work — it spreads
`...message` straight into `transport.sendMail()`, so every field passes through.

### Sanitize manager/client-authored text before it becomes a header or ICS line

Free-text fields (event title, client name) reach single-line sinks where an
embedded CR/LF lets the remainder be reparsed as structure. Route them through
`src/lib/utilities/emailSafeText.ts` — `stripNewlines` for a `Subject` or an ICS
property value, `headerDisplayName` for an unquoted `From` display name (also
strips `"<>`).

Two sinks are easy to miss:

- **ICS calendar `name`.** `ical-generator` escapes the VEVENT TEXT fields
  (`SUMMARY`/`LOCATION`/`DESCRIPTION`) per RFC 5545 but **not** the
  calendar-level `NAME`/`X-WR-CALNAME` — a raw CR/LF there injects real calendar
  lines (a `BEGIN:VALARM` component, a second `VEVENT`). `buildEventCalendar`
  strips the title before setting the name.
- **`Subject`.** The event title is interpolated into `confirmation_subject`;
  `stripNewlines` collapses it so it can't start a second header.

Both are manager-trust-boundary (managers author titles), so this is defence in
depth — but the sink is the right place to enforce it, and it covers rows that
skipped field validation.

## Env vars

```env
RESEND_API_KEY=your-resend-api-key-here   # production only
```

## Templates (React Email)

Transactional emails are authored as [React Email](https://react.email) (by
Resend) components under `src/emails/`, rendered to inline HTML at send time.
Components and the `render()` util both come from the single `react-email`
package (v6 unified them — the older `@react-email/components` and
`@react-email/render` packages are deprecated).

| File | Purpose |
|---|---|
| `EmailLayout.tsx` | Shared shell — gradient brand header, card body, footer. Exports `BrandButton`, `BrandButtonRow` (2–3 actions centered together on one row), `DetailRow` (label/value fact-table row, for manager emails), `StackedDetailRow` (label-above-value itinerary row, for guest emails), `SectionHeading` (uppercase section label), and shared `styles`. Reuse these so templates stay visually consistent. |
| `VerifyEmail.tsx` | Managers email-verification message. |
| `ResetPasswordEmail.tsx` | Managers password-reset message (replaces Payload's bare default). |
| `EventVerificationEmail.tsx` | Manager/region event-verification reminder — coloured alert callout keyed on `ReminderLevel`. |
| `RegistrationConfirmationEmail.tsx` | Registrant confirmation for an event registration — client-branded, localized, ICS attached. Also exports `registrationConfirmationText` (the plain-text alternative). |
| `SessionReminderEmail.tsx` | Registrant reminder ~24h before a session (#589) — client-branded, localized sibling of the confirmation sharing `StackedDetailRow`; states the single next occurrence, **no** ICS, footer unsubscribe link. Also exports `sessionReminderText`. Sent by the `SendSessionReminders` job. |
| `EventRegistrationEmail.tsx` | Manager-facing notice that a seeker registered — Sahaj Atlas project brand; event/registrant/start-date `DetailRow`s, the registrant's forwarded question answers (resolved via `buildRegistrationAnswers`), and a `BrandButtonRow` of Reply (a `mailto:` pre-filled with a quoted recap) + View event. Also exports `buildReplyBody`. Informational (no alert callout). |
| `ContactAdminEmail.tsx` | Admin-facing message sent on a viewer's behalf via `POST /api/contact-admin` (#602) — the informational shape (no callout, no CTA: replying *is* the action, and `Reply-To` is already the sender). Deliberately caller-agnostic: the message, then a `DetailRow` block built by the exported `buildContactDetails` from whatever context the caller sent, each row omitted when its value is absent. |
| `RegistrationDigestEmail.tsx` | Manager-facing digest (#589) — Sahaj Atlas project brand; new registrations grouped by event, one email per recipient per period. Each registration is a card: an inline identity line (name · email · "Attending" session) plus the registrant's question answers; a compact `formatShortDate` is used for the session. Also exports `registrationDigestText`. Sent by the `SendRegistrationDigests` job. |

### Manager mail vs registrant mail

The two audiences look deliberately different, and a new template should pick a
side rather than splitting the difference:

- **Manager / admin, action needed** (`EventVerificationEmail`) — an alert.
  Coloured callout banner, a deadline, urgency colour keyed on severity.
- **Manager / admin, informational** (`EventRegistrationEmail`) — a notice, not
  an alert. No callout or deadline; a `DetailRow` fact table (event, registrant,
  start date), the registrant's forwarded answers, a Reply / View-event button
  row, and the **project** brand. Use this shape when you're telling a manager
  that something happened rather than that they must act. (A `mailto:` Reply
  can't set threading headers, so it pre-fills a quoted recap instead of
  threading into the registrant's confirmation email.)
- **Registrant / guest** (`RegistrationConfirmationEmail`, `SessionReminderEmail`) —
  an itinerary. No callout, no deadline; label-above-value `StackedDetailRow`s, and
  the only accent is the **client service's** own brand.

Email glue lives in the plugin (`@/plugins/email`); only the JSX templates live
in `src/emails/`.

- **Render**: `renderEmail(element)` wraps `react-email`'s async
  `render()`. Payload's `generateEmailHTML` accepts the async return, so a
  collection wires a template in one call. `.ts` files use `createElement`
  (JSX needs `.tsx`):

  ```typescript
  import { createElement } from 'react'
  import { VerifyEmail } from '@/emails/VerifyEmail'
  import { getEmailBrand, renderEmail } from '@/plugins/email'

  generateEmailHTML: ({ token, user }) =>
    renderEmail(createElement(VerifyEmail, { name: user.name, verifyUrl })),
  ```

- **Branding is per-project**: `getEmailBrand(project)` composes
  `{ productName, colors, iconUrl }` from the existing `getProjectLabel` /
  `getBrandColors` / `getProjectIcon` helpers. Defaults to `wemeditate-web`.
  Templates never hardcode a color or name — they take branding as a prop, in one
  of two shapes:

  - **`project?: ProjectSlug`**, resolved inside the template
    (`EventRegistrationEmail`). Fine when the template is the only consumer of
    the brand.
  - **`brand: EmailBrand`**, resolved once by the send helper and passed down
    (`SessionReminderEmail`, `RegistrationDigestEmail`, `ContactAdminEmail`).
    Prefer this when the **sender** also needs the brand — e.g. for the `From`
    display name — so the header and the body can't resolve to different brands.

- **Registrant mail is branded per client service**, not per project:
  `getClientEmailBrand(client)` returns the same `EmailBrand` shape from a
  `Clients` doc's `name` / `color1` / `color2` / `logo`, falling back
  **field-by-field** to the `sahaj-atlas` project brand, so a service that
  configured only a colour still gets a sensible name and icon. Pass a client
  read at `depth >= 1` — the logo resolves through Cloudflare Images with an
  explicit `format=png` variant, because the default `auto` negotiates
  WebP/AVIF from request headers an email client doesn't send, and Outlook
  renders neither.

- **Sending as a client service is not possible.** Resend verifies senders per
  domain, so `From` stays `CONTACT_EMAIL` with the client name as the display
  name; the client's `supportEmail` rides on `Reply-To` so replies reach them.

- **Preview**: render a template in a unit test
  (`tests/unit/email-templates.spec.ts`), or run the `react-email` CLI's local
  preview server against `src/emails/` (`pnpm exec email dev`).

  To see a real message in a real client — including the parts a render test
  can't show (subject, `From`, `Reply-To`, the plain-text part, attachments) —
  use the Ethereal preview scripts, which drive the actual send path rather than
  reimplementing it, so they can't drift from production:

  ```bash
  pnpm tsx scripts/preview-registration-emails.ts               # registrant confirmation, all states
  pnpm tsx scripts/preview-registration-notification-emails.ts  # manager registration notice, all states
  pnpm tsx scripts/preview-event-emails.ts                      # manager verification reminders
  ```

  Neither touches the database. `SAHAJCLOUD_URL` defaults to production in the
  registration script so the header icon resolves in the preview.

- **Icons — emails are the exception to the no-emoji rule.** The repo uses
  `lucide-react` for HTML UI (see `.claude/rules/code-style.md`), but email
  clients (Gmail strips inline `<svg>`, Outlook can't render it) won't show SVG
  icons. In templates, keep **emoji** (they render as native glyphs) or use a
  **hosted PNG** via react-email's `<Img>` — never `lucide-react` or
  `@payloadcms/ui` icons.

## Localized copy & plural forms

Registrant-facing chrome (the confirmation / reminder / unsubscribe copy) is
resolved **server-side** by `resolveEmailStrings()` (`src/lib/translations/emailStrings.ts`)
from the Atlas translations `emails` group, merged over the English
`EMAIL_STRING_DEFAULTS`. Templates receive already-resolved strings as props and
never query — see the group note in `.claude/rules/globals.md`.

**Plurals go through `pluralize()`, not `interpolate()`.** A quantity-dependent
string is stored as a family of keys suffixed with the CLDR categories —
`sessions_count_one` / `_few` / `_many` / `_other` — and selected at render time:

```tsx
// ❌ flat key — reads "1 sessions", and can't spell Russian/Czech plurals
interpolate(strings.sessions_count, { count })
// ✅ locale-aware — Intl.PluralRules picks the form (ru 2 → few, 5 → many; cs 5 → other)
pluralize(strings, 'sessions_count', count, locale)
```

- **The selecting layer is the resolver**, via `Intl.PluralRules(locale)` — the
  platform's own CLDR data, so no per-language plural logic is hardcoded. The
  chosen `<baseKey>_<category>` is used, falling back to `<baseKey>_other`.
- **English defaults define all four forms** (`few`/`many` duplicate `other`) so
  a locale that uses `few`/`many` still falls back to sensible English when a
  translator leaves a form blank — `resolveEmailStrings` fills blanks per key.
- **Thread the registrant `locale` into the template** (it's a prop) — without
  it `pluralize` defaults to English and every locale silently gets the English
  form. The send path (`sendRegistrationConfirmation`) and the preview script
  both pass it.
- To add a new pluralized key: declare it once with `plural: true` in
  `translationsSchema.json` (the field builder expands it into the CLDR family —
  see `.claude/rules/globals.md`), add the `_one`/`_few`/`_many`/`_other` family
  to `EMAIL_STRING_DEFAULTS`, then call `pluralize` at the use site.

## Authentication features

- **Email verification** (`VerifyEmail`) and **password reset**
  (`ResetPasswordEmail`) are custom React Email templates wired on the Managers
  collection (`auth.verify` / `auth.forgotPassword`) — no longer Payload's bare
  defaults. Subjects derive from the resolved brand product name.
