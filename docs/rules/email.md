---
paths:
  - src/plugins/email/**/*.ts
  - src/emails/**/*.tsx
---

# Email Configuration

The app switches email providers by environment:

| Environment | Provider | Notes |
|---|---|---|
| Development & PR previews | Mailpit, via `SMTP_URL` | Captures outbound mail. Nothing is delivered. Messages keep a stable `/view/<id>` link for **7 days**, so a PR reviewer can open them. `SMTP_URL` / `MAILPIT_URL` / `MAILPIT_UI_AUTH` live in `.env.claude.local`. From `dev@wemeditate.com`. |
| Anywhere else, with no `SMTP_URL` | Disabled, with a warning | No silent fallback transport — see below. |
| Production | Resend (transactional API) | Custom adapter at `src/plugins/email/resendAdapter.ts`. From `contact@sydevelopers.com`. Free tier: 3,000 emails/month. |
| Test | Disabled | Avoids Payload model conflicts under parallel test runs. Test email logic separately, without a full Payload boot. |

## Resend adapter

- Implements Payload's `EmailAdapter`.
- **Graceful fallback**: a missing `RESEND_API_KEY` logs an error and returns an error message ID. It never throws.
- Every operation is logged for debugging.
- `src/payload.config.ts` picks the adapter by `NODE_ENV`.

### A failed send never throws — so it reports itself to Sentry

This must stay true: `sendVerificationEmail` runs at `create.js:231`, after `registerLocalStrategy` but **before** `commitTransaction`. A throw there would roll back the whole manager creation and return a 500 with no account. The cost is that nothing reaches the Sentry plugin, which only hooks `afterError` — so a production delivery failure used to exist **only as a pino line**, with no Sentry issue, no admin-visible error, and no DB trace (#320).

So the adapter's three non-throwing paths — no client, a Resend API error, a caught exception — each capture to Sentry themselves, and still return normally.

⚠ **The capture carries nothing from the message** — no recipient, no subject. A `user-messages` send carries a viewer-authored subject, and that collection sits in `RESTRICTED_COLLECTIONS` because it holds personal data. Copying it into a third-party error tracker would widen where that data lives. The pino line beside each capture already has the detail — don't add more.

### It hand-maps the message — an unmapped field is silently dropped

Payload's `SendEmailOptions` is nodemailer-shaped, but the adapter translates it field by field into Resend's REST payload. An unmapped field never errors — it just never arrives. That is how `attachments` and `replyTo` went missing until #582. **When a template needs a new message field, add it to the mapping and pin it in `tests/unit/resend-adapter.spec.ts`.**

Currently mapped: `from`, `to`, `subject`, `html`, `text`, `replyTo`, `attachments`.

- `attachments` narrows to a string/Buffer `content` or a hosted `path`. nodemailer also allows a `Readable`, which Resend's REST API cannot accept — a stream is dropped with a warning rather than sent as a payload that would 422.
- `replyTo` flattens nodemailer's `Address` objects to plain strings.

The nodemailer/Mailpit adapter needs no such mapping — it spreads `...message` straight into `transport.sendMail()`, so every field passes through.

### Why there is no fallback transport

This file once said development used Ethereal, which was never actually configured — it was simply `nodemailerAdapter`'s default when given no `transportOptions`. That invisible default caused two problems, which is why the current three-way branch in `src/payload.config.ts` is explicit:

1. **Ethereal deletes messages after a few hours.** A preview link pasted into a PR was dead before anyone reviewed it.
2. **Railway PR previews run with `NODE_ENV=production`**, so they never reached the fallback — they took the Resend branch and sent **real mail to real addresses**. Storage already had preview isolation (`previewIsolation.ts`). Email did not.

So: canonical production uses Resend, `SMTP_URL` set uses Mailpit, and otherwise mail is disabled loudly.

**Production is detected with `isProductionDeployment()`, not `NODE_ENV`** — the same helper storage relies on, reading Railway's environment name. This matters more than variable hygiene: a preview environment inherits `RESEND_API_KEY` from production and is recreated for every PR, so "remember to unset the key on preview" would fail on the next PR. Gating in code means a preview *cannot* reach Resend, whatever it inherits. Set `SMTP_URL` on preview environments so their mail is captured, not dropped.

### Sanitize manager/client-authored text before it becomes a header or ICS line

A free-text field (event title, client name) can reach a single-line sink where an embedded CR/LF lets the rest be reparsed as structure. Route such text through `src/lib/utilities/emailSafeText.ts` — `stripNewlines` for a `Subject` or an ICS property, `headerDisplayName` for an unquoted `From` display name (it also strips `"<>`).

Two sinks are easy to miss:

- **ICS calendar `name`.** `ical-generator` escapes VEVENT TEXT fields (`SUMMARY`/`LOCATION`/`DESCRIPTION`) per RFC 5545, but **not** the calendar-level `NAME`/`X-WR-CALNAME` — a raw CR/LF there injects real calendar lines (a `BEGIN:VALARM`, a second `VEVENT`). `buildEventCalendar` strips the title before setting the name.
- **`Subject`.** The event title is interpolated into `confirmation_subject`. `stripNewlines` stops it starting a second header.

Managers author both, so this is defense in depth — but the sink is the right enforcement point, since it also covers rows that skipped field validation.

## Env vars

```env
RESEND_API_KEY=your-resend-api-key-here   # production only
```

## Templates (React Email)

Transactional emails are [React Email](https://react.email) components under `src/emails/`, rendered to inline HTML at send time. Components and `render()` both come from the single `react-email` package (v6 unified them — `@react-email/components` and `@react-email/render` are deprecated).

| File | Purpose |
|---|---|
| `EmailLayout.tsx` | Shared shell (header, card body, footer). Exports `BrandButton`, `BrandButtonRow`, `DetailRow` (manager fact table), `StackedDetailRow` (guest itinerary row), `SectionHeading`, `ProgressBar`, and shared `styles`. Reuse these for visual consistency. |
| `VerifyEmail.tsx` | Manager email-verification message. |
| `ResetPasswordEmail.tsx` | Manager password-reset message (replaces Payload's default). |
| `EventVerificationEmail.tsx` | Manager/region verification reminder, with a listing-quality progress section (#611) shown to the **event manager only**. A complete listing drops the progress bar and keeps only the ticks. An absent `listingProgress` renders no section at all. |
| `RegistrationConfirmationEmail.tsx` | Registrant confirmation — client-branded, localized, ICS attached. Also exports `registrationConfirmationText`. |
| `SessionReminderEmail.tsx` | Registrant reminder ~24h before a session (#589) — client-branded, no ICS, footer unsubscribe link. Sent by `SendSessionReminders`. |
| `EventRegistrationEmail.tsx` | Manager notice of a new registration — Sahaj Atlas brand, `DetailRow`s, a Reply/View-event button row. Informational, no alert callout. |
| `UserMessageEmail.tsx` | Admin-facing message sent on a viewer's behalf, once a `user-messages` row passes screening (#632). Caller-agnostic: a `DetailRow` block from `buildUserMessageDetails`, each row omitted when its value is absent. |
| `RegistrationDigestEmail.tsx` | Manager digest of new registrations (#589), grouped by event, one email per recipient per period. Sent by `SendRegistrationDigests`. |
| `PostEventFollowUpEmail.tsx` | Registrant follow-up after an attended session (#626), built from composable `sections` so later kinds can be added. Today's only section is a feedback ask, sent only for a published, `unverified` event. Sent by `SendPostEventFollowUps`. |

### Registrant mail: the six things, every time

The follow-up email once shipped missing four of these, which is why they're written down. Every registrant template and sender does all six:

| # | What | Why it isn't optional |
|---|---|---|
| 1 | `brand = client ? getClientEmailBrand(client) : getEmailBrand('sahaj-atlas')` | Registrant mail is branded per **client service**, not per project. The project brand is a fallback. |
| 2 | `strings = await resolveEmailStrings({ payload, locale, req })` | The registration stores a `locale` for this. Hardcoded English JSX ships English to every locale. |
| 3 | `from: headerDisplayName(brand.productName) <CONTACT_EMAIL>` | Resend verifies senders per domain, so mail can't send *as* the client — the display name carries the brand. |
| 4 | `replyTo: client.supportEmail` when set | Otherwise a reply reaches nobody who can answer. |
| 5 | `subject: stripNewlines(...)` | An event title is manager-authored free text. A CR/LF starts a second header. |
| 6 | `text: <template>Text(props)` | A message with no plain-text part scores worse with spam filters and renders as nothing in a text-only client. |

`sendSessionReminder` is the reference implementation — copy its shape, not a template's.

### Manager mail vs registrant mail

Pick one shape per new template, not a blend:

- **Manager, action needed** (`EventVerificationEmail`) — an alert: a colored callout, a deadline, urgency-keyed color.
- **Manager, informational** (`EventRegistrationEmail`) — a notice: no callout, a `DetailRow` fact table, forwarded answers, a Reply/View-event row, the **project** brand.
- **Registrant / guest** (`RegistrationConfirmationEmail`, `SessionReminderEmail`) — an itinerary: no callout, `StackedDetailRow`s, and the only accent is the **client service's** own brand.

Email glue lives in the plugin (`@/plugins/email`). Only JSX templates live in `src/emails/`.

- **Render**: `renderEmail(element)` wraps `react-email`'s async `render()`. `.ts` files use `createElement` (`.tsx` for JSX):

  ```typescript
  import { createElement } from 'react'
  import { VerifyEmail } from '@/emails/VerifyEmail'
  import { getEmailBrand, renderEmail } from '@/plugins/email'

  generateEmailHTML: ({ token, user }) =>
    renderEmail(createElement(VerifyEmail, { name: user.name, verifyUrl })),
  ```

- **Branding is per-project** by default: `getEmailBrand(project)` composes `{ productName, colors, iconUrl }`, defaulting to `wemeditate-web`. A template takes branding as a prop, never a hardcoded color: either `project?: ProjectSlug` (resolved inside the template) when it is the only consumer, or `brand: EmailBrand` (resolved once by the sender and passed down) when the sender also needs it — e.g. for the `From` name — so header and body can't resolve to different brands.
- **Registrant mail is branded per client service**: `getClientEmailBrand(client)` builds the same `EmailBrand` shape from a `Clients` doc, falling back field-by-field to the `sahaj-atlas` project brand. Read the client at `depth >= 1` — the logo needs an explicit `format=png` variant, since the default `auto` negotiates WebP/AVIF from headers an email client never sends, and Outlook renders neither.
- **Sending as a client service is not possible.** Resend verifies senders per domain, so `From` stays `CONTACT_EMAIL` with the client name as display name. The client's `supportEmail` rides on `Reply-To`.
- **Preview**: render a template in a unit test (`tests/unit/email-templates.spec.ts`), or run `pnpm exec email dev` for the `react-email` CLI's local preview. To see a real message in a real client — subject, `From`, `Reply-To`, the plain-text part, attachments — use the Mailpit preview scripts, which drive the real send path so they can't drift from production:

  ```bash
  pnpm tsx scripts/preview-registration-emails.ts               # registrant confirmation, all states
  pnpm tsx scripts/preview-registration-notification-emails.ts  # manager registration notice, all states
  pnpm tsx scripts/preview-event-emails.ts                      # manager verification reminders
  ```

  Neither touches the database.

- **A progress bar is two table cells, not a styled `<div>`.** Outlook's Word rendering engine drops CSS backgrounds on a `<div>`, and no client reliably supports `<progress>`. `ProgressBar` uses a real `<table>` with `backgroundColor` per cell, each holding an NBSP (`' '`, not a plain space, which collapses as insignificant whitespace). A zero-width cell is omitted, since some clients round `width: 0%` up to a visible sliver.
- **Icons: emails are the exception to the no-emoji rule.** Gmail strips inline `<svg>` and Outlook can't render it, so templates keep **emoji** or a **hosted PNG** via `<Img>` — never `lucide-react` or `@payloadcms/ui` icons.

## Localized copy & plural forms

Registrant-facing chrome is resolved **server-side** by `resolveEmailStrings()` (`src/lib/translations/emailStrings.ts`) from the Atlas `emails` translation group, merged over the English `EMAIL_STRING_DEFAULTS`. Templates receive resolved strings as props and never query.

**Plurals go through `pluralize()`, not `interpolate()`.** A quantity-dependent string is a family of keys suffixed with CLDR categories (`sessions_count_one` / `_few` / `_many` / `_other`), selected at render time:

```tsx
// ❌ flat key — reads "1 sessions", and can't spell Russian/Czech plurals
interpolate(strings.sessions_count, { count })
// ✅ locale-aware — Intl.PluralRules picks the form (ru 2 → few, 5 → many; cs 5 → other)
pluralize(strings, 'sessions_count', count, locale)
```

- The resolver selects the form via `Intl.PluralRules(locale)` — the platform's own CLDR data, so no per-language logic is hardcoded.
- English defaults define all four forms, so a locale missing a `few`/`many` translation still falls back to sensible English.
- **Thread the registrant `locale` into the template.** Without it, `pluralize` defaults to English for every locale.
- To add a pluralized key: mark it `plural: true` in `translationsSchema.json`, add the four-form family to `EMAIL_STRING_DEFAULTS`, then call `pluralize` at the use site.

## Authentication features

**Email verification** (`VerifyEmail`) and **password reset** (`ResetPasswordEmail`) are custom React Email templates wired on `Managers` (`auth.verify` / `auth.forgotPassword`) — no longer Payload's bare defaults. Subjects derive from the resolved brand name.

### ⚠ The two token URLs have different shapes, and only one carries the slug

They sit side by side in `Managers.ts` and look like they should match. They must not:

| Link | Correct URL | Why |
|---|---|---|
| Verify | `/admin/managers/verify/:token` | Payload matches `/:collectionSlug/verify/:token` in `getRouteData.js`. The slug is **required**, and there is no `collections/` prefix. |
| Reset | `/admin/reset/:token` | Matched by name against `config.admin.routes.reset`, so it carries **no** slug. |

A verify URL written in the reset shape (`/admin/verify/:token`) matches nothing, and **fails silently instead of 404ing**: `isPublicAdminRoute` returns true for any route containing `/verify/`, so the auth gate never fires and a logged-out recipient lands on the login form. It looks exactly like the email never arrived, and it shipped that way from #483 to #320.

You will not reproduce this locally — `admin.autoLogin` makes `req.user` truthy on every dev request, taking the `notFound()` branch and showing a 404 instead. Open the link in a **private window**, or trust `tests/unit/manager-auth-urls.spec.ts`, which pins both shapes against Payload's own `formatAdminURL`. A template render spec cannot catch this: it asserts a URL round-trips, and a wrong URL round-trips just as happily.
