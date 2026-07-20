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
| `EmailLayout.tsx` | Shared shell — gradient brand header, card body, footer. Exports `BrandButton`, `DetailRow` (label/value fact-table row), and shared `styles`. |
| `VerifyEmail.tsx` | Managers email-verification message. |
| `ResetPasswordEmail.tsx` | Managers password-reset message (replaces Payload's bare default). |
| `EventVerificationEmail.tsx` | Manager/region event-verification reminder — coloured alert callout keyed on `ReminderLevel`. |
| `RegistrationConfirmationEmail.tsx` | Registrant confirmation for an event registration — client-branded, localized, ICS attached. Also exports `registrationConfirmationText` (the plain-text alternative). |
| `EventRegistrationEmail.tsx` | Manager-facing notice that a seeker registered — Sahaj Atlas project brand, event/registrant/session `DetailRow`s, and a link to the event in the admin. Informational (no alert callout). |

### Manager mail vs registrant mail

The two audiences look deliberately different, and a new template should pick a
side rather than splitting the difference:

- **Manager / admin, action needed** (`EventVerificationEmail`) — an alert.
  Coloured callout banner, a deadline, urgency colour keyed on severity.
- **Manager / admin, informational** (`EventRegistrationEmail`) — a notice, not
  an alert. No callout or deadline; a `DetailRow` fact table (event, registrant,
  session) and the **project** brand. Use this shape when you're telling a
  manager that something happened rather than that they must act.
- **Registrant / guest** (`RegistrationConfirmationEmail`) — an itinerary. No
  callout, no deadline; label-above-value detail rows, and the only accent is
  the **client service's** own brand.

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
  `getBrandColors` / `getProjectIcon` helpers. Defaults to `wemeditate-web`;
  pass a `project` prop to a template to brand a send for another project
  (`wemeditate-app`, `sahaj-atlas`). Templates never hardcode a color or name.

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

## Authentication features

- **Email verification** (`VerifyEmail`) and **password reset**
  (`ResetPasswordEmail`) are custom React Email templates wired on the Managers
  collection (`auth.verify` / `auth.forgotPassword`) — no longer Payload's bare
  defaults. Subjects derive from the resolved brand product name.
