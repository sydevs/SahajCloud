---
paths:
  - src/plugins/email/**/*.ts
  - src/emails/**/*.tsx
---

# Email Configuration

The application uses different email providers based on environment:

| Environment | Provider | Notes |
|---|---|---|
| Development & PR previews | Mailpit, via `SMTP_URL` | Captures outbound mail; nothing is delivered. Messages kept **7 days** with a stable `/view/<id>` link, which is what makes them reviewable from a PR. `SMTP_URL` / `MAILPIT_URL` / `MAILPIT_UI_AUTH` live in `.env.claude.local`. From `dev@wemeditate.com`. |
| Anywhere else (no `SMTP_URL`) | Disabled, with a warning | There is deliberately no silent fallback transport — see below. |
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

The **nodemailer/Mailpit** adapter needs no equivalent work — it spreads
`...message` straight into `transport.sendMail()`, so every field passes through.

### Why there is no fallback transport

This file used to say development used Ethereal, which was never configured:
it was simply what `nodemailerAdapter` fell back to when given no
`transportOptions`. That invisible default caused two problems, and both are the
reason the current three-way branch in `src/payload.config.ts` is explicit.

1. **Ethereal deletes messages after a few hours.** A preview link pasted into a
   PR was dead before anyone reviewed it.
2. **Railway PR previews run with `NODE_ENV=production`**, so they never reached
   the fallback at all — they took the Resend branch and sent **real mail to real
   addresses**. Storage has had preview isolation (`previewIsolation.ts`) for a
   while; email had no equivalent.

So: canonical production → Resend; `SMTP_URL` set → Mailpit; otherwise →
disabled loudly.

**Production is detected with `isProductionDeployment()`, not `NODE_ENV`** —
reusing the helper storage already relies on, which reads Railway's environment
name. This matters more than variable hygiene: preview environments inherit
`RESEND_API_KEY` from production and are recreated for every PR, so "remember to
unset the key on the preview" would fail on the next PR anyone opens. Gating in
code means a preview *cannot* reach Resend regardless of what variables it
inherits. Set `SMTP_URL` on preview environments so their mail is captured
rather than dropped.

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
| `EmailLayout.tsx` | Shared shell — gradient brand header, card body, footer. Exports `BrandButton`, `BrandButtonRow` (2–3 actions centered together on one row), `DetailRow` (label/value fact-table row, for manager emails), `StackedDetailRow` (label-above-value itinerary row, for guest emails), `SectionHeading` (uppercase section label), `ProgressBar` (filled/unfilled table cells + an "N of M" caption), and shared `styles`. Reuse these so templates stay visually consistent. |
| `VerifyEmail.tsx` | Managers email-verification message. |
| `ResetPasswordEmail.tsx` | Managers password-reset message (replaces Payload's bare default). |
| `EventVerificationEmail.tsx` | Manager/region event-verification reminder — coloured alert callout keyed on `ReminderLevel`. Also carries the listing-quality progress (#611), built from `EventListingProgress`, worded by the `@/lib/eventQuality` registry (never inlined here) and shown to the **event manager only** — a region manager is there to nudge someone else, and can't act on the listing themselves. A progress bar + "N of M complete", then the open recommendations, then the already-passing ones ticked with each check's `passedLabel`. Wording is keyed by state — `COPY.listing.open` / `COPY.listing.complete`, same shape as `COPY.variants[audience][level]`. A **complete** listing drops the bar (it would only restate the word "complete"), keeps the ticks, and sits in a neutral grey callout — without the bar or a `SectionHeading` it would otherwise read as more event details; an **absent** `listingProgress` (the listing was never checked) renders no section at all — distinct from complete, and asserted as byte-identity rather than "no caption appears", since complete has no caption either. |
| `RegistrationConfirmationEmail.tsx` | Registrant confirmation for an event registration — client-branded, localized, ICS attached. Also exports `registrationConfirmationText` (the plain-text alternative). |
| `SessionReminderEmail.tsx` | Registrant reminder ~24h before a session (#589) — client-branded, localized sibling of the confirmation sharing `StackedDetailRow`; states the single next occurrence, **no** ICS, footer unsubscribe link. Also exports `sessionReminderText`. Sent by the `SendSessionReminders` job. |
| `EventRegistrationEmail.tsx` | Manager-facing notice that a seeker registered — Sahaj Atlas project brand; event/registrant/start-date `DetailRow`s, the registrant's forwarded question answers (resolved via `buildRegistrationAnswers`), and a `BrandButtonRow` of Reply (a `mailto:` pre-filled with a quoted recap) + View event. Also exports `buildReplyBody`. Informational (no alert callout). |
| `UserMessageEmail.tsx` | Admin-facing message sent on a viewer's behalf, delivered by the `screenUserMessage` job once a `user-messages` row passes screening (#632; was `ContactAdminEmail` + the `POST /api/contact-admin` endpoint, #602) — the informational shape (no callout, no CTA: replying *is* the action, and `Reply-To` is already the sender). Deliberately caller-agnostic: the message, then a `DetailRow` block built by the exported `buildUserMessageDetails` from whatever context the caller sent, each row omitted when its value is absent. The footer states that a copy is kept and later deleted — it must not claim the email is the only record, which was true only while nothing was persisted. |
| `RegistrationDigestEmail.tsx` | Manager-facing digest (#589) — Sahaj Atlas project brand; new registrations grouped by event, one email per recipient per period. Each registration is a card: an inline identity line (name · email · "Attending" session) plus the registrant's question answers; a compact `formatShortDate` is used for the session. Also exports `registrationDigestText`. Sent by the `SendRegistrationDigests` job. |
| `PostEventFollowUpEmail.tsx` | Registrant follow-up after a session they attended (#626) — client-branded, localized, plain-text alternative via `postEventFollowUpText`. Built from composable `sections` rather than a fixed body, so later follow-up kinds (feedback forms, event promotion) can be added without another template. Today's only section is the **feedback ask** — "did this class take place?" with confirm/deny buttons — emitted only for an event still published and `unverified`; with no sections the job sends nothing and leaves its watermark unstamped, so those registrations stay eligible for a future follow-up type. Sent by the `SendPostEventFollowUps` job. |

### Registrant mail: the six things, every time

Registrant-facing mail is the shape most easily got half-right — the follow-up
email shipped sharing the layout components but missing four of these, which is
what prompted writing them down. A new registrant template and its sender do
**all six**:

| # | What | Why it isn't optional |
| --- | --- | --- |
| 1 | `brand = client ? getClientEmailBrand(client) : getEmailBrand('sahaj-atlas')` | Registrant mail is branded per **client service**, not per project. The project brand is a fallback, not the default. |
| 2 | `strings = await resolveEmailStrings({ payload, locale, req })` | The registration stores a `locale` for exactly this. Hardcoded English in JSX silently ships English to every locale. |
| 3 | `from: headerDisplayName(brand.productName) <CONTACT_EMAIL>` | Resend verifies senders per domain, so we can't send *as* the client; the display name carries the branding, and `headerDisplayName` strips what would break the header. |
| 4 | `replyTo: client.supportEmail` when set | Otherwise replies reach nobody who can answer. |
| 5 | `subject: stripNewlines(...)` | Event titles are manager-authored free text; a CR/LF starts a second header. |
| 6 | `text: <template>Text(props)` | A message with no plain-text part scores worse with spam filters and renders as nothing in a text-only client. Every registrant template exports one. |

`sendSessionReminder` is the reference implementation; copy its shape rather
than a template's.

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
    (`SessionReminderEmail`, `RegistrationDigestEmail`, `UserMessageEmail`).
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
  use the Mailpit preview scripts, which drive the actual send path rather than
  reimplementing it, so they can't drift from production:

  ```bash
  pnpm tsx scripts/preview-registration-emails.ts               # registrant confirmation, all states
  pnpm tsx scripts/preview-registration-notification-emails.ts  # manager registration notice, all states
  pnpm tsx scripts/preview-event-emails.ts                      # manager verification reminders
  ```

  Neither touches the database. `SAHAJCLOUD_URL` defaults to production in the
  registration script so the header icon resolves in the preview.

- **A progress bar is two table cells, not a styled `<div>`.** Outlook's Word
  rendering engine drops CSS backgrounds on a `<div>`, and no client can be
  relied on for `<progress>`. `ProgressBar` uses `Row`/`Column` (a real
  `<table>`) with `backgroundColor` per cell, each holding an `NBSP` sized by
  `line-height` — an empty cell collapses in Outlook, and a *plain* space is
  collapsed as insignificant whitespace, so the constant is spelled `'\u00A0'`
  rather than typed literally. A zero-width cell is omitted entirely, because
  some clients round `width: 0%` up to a visible sliver.

- **Icons — emails are the exception to the no-emoji rule.** The repo uses
  `lucide-react` for HTML UI (see `docs/code-style.md`), but email
  clients (Gmail strips inline `<svg>`, Outlook can't render it) won't show SVG
  icons. In templates, keep **emoji** (they render as native glyphs) or use a
  **hosted PNG** via react-email's `<Img>` — never `lucide-react` or
  `@payloadcms/ui` icons.

## Localized copy & plural forms

Registrant-facing chrome (the confirmation / reminder / unsubscribe copy) is
resolved **server-side** by `resolveEmailStrings()` (`src/lib/translations/emailStrings.ts`)
from the Atlas translations `emails` group, merged over the English
`EMAIL_STRING_DEFAULTS`. Templates receive already-resolved strings as props and
never query — see the group note in `src/globals/AGENTS.md`.

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
  see `src/globals/AGENTS.md`), add the `_one`/`_few`/`_many`/`_other` family
  to `EMAIL_STRING_DEFAULTS`, then call `pluralize` at the use site.

## Authentication features

- **Email verification** (`VerifyEmail`) and **password reset**
  (`ResetPasswordEmail`) are custom React Email templates wired on the Managers
  collection (`auth.verify` / `auth.forgotPassword`) — no longer Payload's bare
  defaults. Subjects derive from the resolved brand product name.
