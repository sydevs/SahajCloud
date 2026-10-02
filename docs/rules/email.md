---
paths:
  - src/plugins/email/**/*.ts
  - src/emails/**/*.tsx
---

# Email Configuration

The app switches email providers by environment:

| Environment | Provider | Notes |
|---|---|---|
| Development & PR previews | Mailpit, via `SMTP_URL` | Captures outbound mail. Nothing is delivered. Messages keep a stable `/view/<id>` link for **7 days**, so a PR reviewer can open them. From `dev@wemeditate.com`. Previews inherit `SMTP_URL` from production (see below). Locally it lives in `.env.claude.local`, beside the preview scripts' `MAILPIT_*` variables. |
| Anywhere else, with no `SMTP_URL` | Disabled, with a warning | No silent fallback transport — see below. |
| Production | Resend (transactional API) | Custom adapter at `src/plugins/email/resendAdapter.ts`. `From` splits by audience — see below. Free tier: 3,000 emails/month. |
| Test | Disabled | Avoids Payload model conflicts under parallel test runs. Test email logic separately, without a full Payload boot. |

## The envelope sender splits by audience, and is not the contact address

Three addresses, three jobs. Confusing them is what #790 was:

| Constant | Default | Used as |
|---|---|---|
| `USER_EMAIL_FROM` (`@/plugins/email`) | `admin@wemeditate.com` | `From` on registrant mail — confirmation, session reminder, post-event follow-up |
| `MANAGER_EMAIL_FROM` (`@/plugins/email`) | `contact@sydevelopers.com` | `From` on manager, reviewer and admin-inbox mail, and the adapter's default (so Payload's own auth mail) |
| `CONTACT_EMAIL` (`@/lib/contact`) | `contact@sydevelopers.com` | The `mailto:` shown to a human, and the default `To` for inbound forms and messages. **Never a `From`.** |

**The `to:` of a send decides which sender it takes** — there is no audience flag to thread. `sendUserMessage` is the one that reads wrong: despite the name it delivers a *viewer's* message to the admin inbox, so it is manager-facing.

⚠ **An envelope sender's domain must be verified in Resend.** Resend refuses a send from an unverified domain, and the adapter's non-throwing contract below turns that refusal into a Sentry event and nothing else — no admin error, no user-visible failure. Production sent nothing for weeks on a one-label mismatch: `cloud.sydevelopers.com` was verified while the sender resolved to the root domain. Adding a third sender means verifying its domain **first**.

## Resend adapter

- Implements Payload's `EmailAdapter`.
- **Graceful fallback**: a missing `RESEND_API_KEY` logs an error and returns an error message ID. It never throws.
- Every operation is logged for debugging.
- `src/payload.config.ts` picks the adapter by `NODE_ENV`.

### A failed send never throws — so it reports itself to Sentry

This must stay true: `sendVerificationEmail` runs at `create.js:231`, after `registerLocalStrategy` but **before** `commitTransaction`. A throw there would roll back the whole manager creation and return a 500 with no account. The cost is that nothing reaches the Sentry plugin, which only hooks `afterError` — so a production delivery failure used to exist **only as a pino line**, with no Sentry issue, no admin-visible error, and no DB trace (#320).

So the adapter's three non-throwing paths — no client, a Resend API error, a caught exception — each capture to Sentry themselves, and still return normally.

⚠ **The capture carries nothing from the message** — no recipient, no subject. A contact send carries a viewer-authored subject, and `user-submissions` sits in `RESTRICTED_COLLECTIONS` because it holds personal data. Copying it into a third-party error tracker would widen where that data lives. The pino line beside each capture already has the detail — don't add more.

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

**Production is detected with `isProductionDeployment()`, not `NODE_ENV`** — the same helper storage relies on, reading Railway's environment name. This matters more than variable hygiene: a preview environment inherits `RESEND_API_KEY` from production and is recreated for every PR, so "remember to unset the key on preview" would fail on the next PR. Gating in code means a preview *cannot* reach Resend, whatever it inherits.

**`SMTP_URL` is set on production's SahajCloud service for the same reason.** Railway copies production's variables into a PR environment when it creates one, so a per-preview setting would not survive the next PR. On production it is inert, since the Resend branch is taken first. It must be Mailpit's public TCP-proxy address, not `mailpit.railway.internal`: private networking does not cross environments. A preview created before the variable existed has no `SMTP_URL`, and drops its mail with a warning until it is set there by hand.

⚠ **The preview scripts never read `SMTP_URL`.** They post to Mailpit's HTTP send API (`scripts/mailpit-transport.ts`), because a Claude routine reaches the network only through an HTTPS proxy, and SMTP times out there (#807). They need `MAILPIT_URL` and `MAILPIT_UI_AUTH`, which the Claude cloud environment carries. The login can read every captured message too. That is acceptable for the two senders this inbox was built for: a preview's database holds no production rows (`docs/rules/storage.md`), and production mail goes to Resend.

⚠ **A third sender can now reach it, and nothing in code stops it.** `pnpm db:refresh-from-prod` (#876) puts real people in a local database, and a local `SMTP_URL` pointing at the shared Railway Mailpit would hold their mail for 7 days behind a login several people have. The guard is configuration, not code: on a copy of production leave `SMTP_URL` unset — mail is then disabled loudly — or point it at a Mailpit running on your own machine. README → "Working on a copy of production data" is the checklist.

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
| `InviteEmail.tsx` | Manager invitation (#839): what a manager was just assigned — roles, and each region, event and page naming them, one per line and linked to its public page — with an Atlas introduction and the assigner's name. An accepted manager gets the same email with a button to the admin instead of an invitation to accept. |
| `SignInLinkEmail.tsx` | The emailed sign-in link an ACCEPTED manager gets (#837). `issueMagicLink` picks between this and the invitation on `_verified`. |
| `EventVerificationEmail.tsx` | Manager/region verification reminder, with a listing-quality progress section (#611) shown to the **event manager only**. A complete listing drops the progress bar and keeps only the ticks. An absent `listingProgress` renders no section at all. |
| `RegistrationConfirmationEmail.tsx` | Registrant confirmation — client-branded, localized, ICS attached. Also exports `registrationConfirmationText`. |
| `SessionReminderEmail.tsx` | Registrant reminder ~24h before a session (#589) — client-branded, no ICS, footer unsubscribe link. Sent by `SendSessionReminders`. |
| `EventRegistrationEmail.tsx` | Manager notice of a new registration — Sahaj Atlas brand, `DetailRow`s, a Reply/View-event button row. Informational, no alert callout. |
| `UserMessageEmail.tsx` | Admin-facing message sent on a viewer's behalf, once a contact submission passes screening (#632). Caller-agnostic: the named form's own answers from `buildFormAnswers` (#832), plus a `DetailRow` context block from `buildUserMessageDetails`, each row omitted when its value is absent. There is no `Message` section — every answer is a sibling row, whatever the field was named. |
| `RegistrationDigestEmail.tsx` | Manager digest of new registrations (#589), grouped by event, one email per recipient per period. Sent by `SendRegistrationDigests`. |
| `PostEventFollowUpEmail.tsx` | Registrant follow-up after an attended session (#626), built from composable `sections` so later kinds can be added. Today's only section is a feedback ask, sent only for a published, `unverified` event. Sent by `SendPostEventFollowUps`. |

### Registrant mail: the six things, every time

The follow-up email once shipped missing four of these, which is why they're written down. Every registrant template and sender does all six:

| # | What | Why it isn't optional |
|---|---|---|
| 1 | `brand = client ? getClientEmailBrand(client) : getEmailBrand('sahaj-atlas')` | Registrant mail is branded per **client service**, not per project. The project brand is a fallback. |
| 2 | `strings = await resolveEmailStrings({ payload, locale, req })` | The registration stores a `locale` for this. Hardcoded English JSX ships English to every locale. |
| 3 | `from: headerDisplayName(brand.productName) <USER_EMAIL_FROM>` | Resend verifies senders per domain, so mail can't send *as* the client — the display name carries the brand. |
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
  import { SignInLinkEmail } from '@/emails/SignInLinkEmail'
  import { renderEmail } from '@/plugins/email'

  generateEmailHTML: ({ doc, signInUrl, validFor }) =>
    renderEmail(createElement(SignInLinkEmail, { name: doc.name, signInUrl, validFor })),
  ```

- **Branding is per-project** by default: `getEmailBrand(project)` composes `{ productName, colors, iconUrl }`, defaulting to `wemeditate-web`. A template takes branding as a prop, never a hardcoded color: either `project?: ProjectSlug` (resolved inside the template) when it is the only consumer, or `brand: EmailBrand` (resolved once by the sender and passed down) when the sender also needs it — e.g. for the `From` name — so header and body can't resolve to different brands.
- **Registrant mail is branded per client service**: `getClientEmailBrand(client)` builds the same `EmailBrand` shape from a `Clients` doc, falling back field-by-field to the `sahaj-atlas` project brand. Read the client at `depth >= 1` — the logo needs an explicit `format=png` variant, since the default `auto` negotiates WebP/AVIF from headers an email client never sends, and Outlook renders neither.
- **Sending as a client service is not possible.** Resend verifies senders per domain, so `From` stays a sender constant (above) with the client name as display name. The client's `supportEmail` rides on `Reply-To`.
- **Preview**: render a template in a unit test (`tests/unit/email-templates.spec.ts`), or run `pnpm exec email dev` for the `react-email` CLI's local preview. To see a real message in a real client — subject, `From`, `Reply-To`, the plain-text part, attachments — use the Mailpit preview scripts, which drive the real send path so they can't drift from production:

  ```bash
  pnpm tsx scripts/preview-registration-emails.ts               # registrant confirmation, all states
  pnpm tsx scripts/preview-registration-notification-emails.ts  # manager registration notice, all states
  pnpm tsx scripts/preview-event-emails.ts                      # manager verification reminders
  pnpm tsx scripts/preview-manager-emails.ts                    # manager invitation + sign-in link
  ```

  None touches the database. `preview-manager-emails.ts` drives
  `composeInvitations` — what both invitation senders run — so the subject, the brand, the
  button and every line are the ones a real send produces.

- **A progress bar is two table cells, not a styled `<div>`.** Outlook's Word rendering engine drops CSS backgrounds on a `<div>`, and no client reliably supports `<progress>`. `ProgressBar` uses a real `<table>` with `backgroundColor` per cell, each holding an NBSP (`' '`, not a plain space, which collapses as insignificant whitespace). A zero-width cell is omitted, since some clients round `width: 0%` up to a visible sliver.
- **Icons: emails are the exception to the no-emoji rule.** Gmail strips inline `<svg>` and Outlook can't render it, so templates keep **emoji** or a **hosted PNG** via `<Img>` — never `lucide-react` or `@payloadcms/ui` icons.

## Localized copy & plural forms

Registrant-facing chrome is resolved **server-side** by `resolveEmailStrings()` (`src/lib/translations/emailStrings.ts`) from the Atlas `emails` translation group, merged over the English `EMAIL_STRING_DEFAULTS`. Templates receive resolved strings as props and never query.

**Keep that merge, even though the CMS now merges English too.** `clientEnglishFallback` (#705) fills a blank key from the CMS's own English — but only for a read whose `req.user.collection` is `clients`. `resolveEmailStrings` reads as a manager or with no user at all, so it never sees that hook. The two are complementary rather than duplicated: the hook covers a key an operator translated into English but not French, and `EMAIL_STRING_DEFAULTS` covers a key nobody has entered anywhere.

`PLURAL_CATEGORIES` now lives in `src/lib/translations/pluralCategories.ts`, re-exported from `@/fields/translationsField` for existing importers.

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

**There is no password mail, because there is no password.** `loginPlugin` sets `auth.disableLocalStrategy` on `managers` (#840), so Payload's `forgotPassword` and `resetPassword` operations answer `Forbidden` and `ResetPasswordEmail` is gone. Every manager email that gets someone in — **the invitation** (`InviteEmail`), **the sign-in link** (`SignInLinkEmail`) and **a reminder's page link** — is sent by the login plugin, not by Payload. See below.

### A manager is invited when assigned something, never on create (#839)

`auth.verify` stays configured for the **column** alone: the JWT strategy yields no user while `_verified` is false, so that column is the accepted/not-accepted flag. Payload's own create would send its verify mail whenever `auth.verify` is set, so `loginPlugin` forces `disableVerificationEmail` in a `beforeOperation` hook — Payload reads it after those hooks run. A create sends nothing, whoever calls it.

The invitation is sent by a queue (`src/plugins/login/invitations.ts`):

- **An assignment queues it.** A role added to a manager, or a region, event or page newly naming one (each collection a `managers` join points at), is recorded on the manager as `pendingInvitation`, and `invitationDueAt` moves to ten minutes on. `sendInvitations` runs every five minutes on the `invitations` queue and sends what is due — so a region and twelve events assigned together are one email. Removing an assignment queues nothing.
- ⚠ **Queue writes go through `payload.db.updateOne`**, never `update`. They are bookkeeping on someone else's save: `update` would run the manager's hooks and validate the whole stored document, so an imported manager with legacy data failing a newer validator would roll back the region save that named them.
- **A manager's own change queues nothing** — creating an event they manage is not news to them. Nor does anything under a seed script: `payload.config.ts` passes `invitations: !isSeedScript`, or an import would leave production hundreds of invitations to send.
- **The send names only what was queued, and only what is still held.** Each queued id is re-read, so an assignment undone before the send is not announced, and a finished event is left out. A queue that names nothing sends nothing. The `invitation` notification preference set to Never turns it off.
- **Confirmed or not decides the button.** An account that has never confirmed its email gets "Confirm your email" — the `manager-invite` link, which activates it and signs it in — plus a short introduction to the project (`PROJECT_INTROS`). One that has gets "Configure notifications": a page link to `/admin/account`, opened on the collection's `notificationsTab` (Managers: Contact). Payload has no URL for a tab, so following the link writes the tab Payload remembers for that record (`seedTabPreference`, the same adapter upsert Payload's own preference update uses); `manager-invite.int.spec.ts` pins the shape. The queue is claimed (cleared) before each send, so an assignment saved mid-send starts a fresh queue rather than being wiped.
- **"Your new…" when it lists only what is new.** A queued send names what was queued; a resend names everything held, and says "Your responsibilities". Singular for exactly one: "Your role", a row labelled "Event".
- **A resend names everything held.** `issueMagicLink` re-sends an invitation to an unaccepted account that asks for a link, listing every role and document it holds — how an imported Atlas manager, named on regions before anything mailed them, gets in. One with nothing assigned is sent nothing: there is nothing to invite them to.
- ⚠ **One email per project.** `summarizeGrants` splits what it names by project, and each part is its own email, branded for that project and introducing it: a brand, an introduction and a heading can speak for only one product. A role goes with its own project, a region or event with Sahaj Atlas, and a page — in both We Meditate projects — with one the manager holds a role in, else We Meditate Web. `currentProject` cannot decide it: only `set-project` writes it, and an account that has never accepted has never signed in to call it. Subject, `From` and body all come from one `composeInvitations` call.
- **Every email to an unconfirmed account carries an invitation link.** The first used activates the account; the others are then spent, and the redeem route answers them with `invite-accepted` — "Your email is already confirmed" — rather than `invalid`. That refusal is reached only with an authentic, unexpired token, so naming it tells nothing to anyone probing without one.
- ⚠ **`_verified` is not a column every auth collection has.** `getAuthFields.js` adds the verification fields only where `auth.verify` is configured. Anything branching on the flag for a *served* collection — `issueMagicLink` picking between the two mails — asks the sanitized config first, or it reads `undefined` and invites every account forever.

### A verification reminder verifies in one click, and never on a `GET`

The reminder's button is a login-plugin **page link** (`manager-link`), built per recipient by `reminderButtonUrl`:

- **The event's manager** gets `/events/verify?link=…`, carrying a `verifies` claim. The page shows the event and two buttons: "Verify this event" (a Server Action) verifies it without signing in, and "Update the details" spends the same link at `redeem-link`, signing them in on the way to the event's admin page. An invalid stored field sends them there too, with the fields named.
- **A region manager** does not verify (they may lack the details), so theirs goes through the sign-in page (`/admin/login?token=…`) straight to the event.
- ⚠ **Nothing happens on a `GET`.** Mail scanners fetch every link in every email, and some render the page; none submits a form. So both pages only read the link, and every change — verifying, signing in — sits behind a button's `POST`. A `PageAction` that signs someone in is `method: 'post'` for the same reason. Never make either link act on open, however convenient.
- **Spending the link accepts an unaccepted account**, as an invitation does, so an imported Atlas manager whose first email is a reminder gets in by it.
- ⚠ **It is reusable for 10 days**, the longest reminder spacing — a reminder is re-read and clicked twice. It is refused once the account stops qualifying, and it can only land under `/admin/`: the path is signed, and `isAdminPath` re-checks it on read, so a signing bug cannot become an open redirect.

### ⚠ The two token URLs have different shapes, and only one carries the slug

⚠ **History now, for both rows.** `auth.verify` no longer builds an admin URL at all — the invitation addresses the sign-in page (`/admin/login?token=…`) instead — and the reset route is `Forbidden` since #840, so nothing addresses it either. The table stays because the trap is the routing rule, and the next auth link written against `formatAdminURL` meets it again.

| Link | Correct URL | Why |
|---|---|---|
| Verify | `/admin/managers/verify/:token` | Payload matches `/:collectionSlug/verify/:token` in `getRouteData.js`. The slug is **required**, and there is no `collections/` prefix. |
| Reset | `/admin/reset/:token` | Matched by name against `config.admin.routes.reset`, so it carries **no** slug. |

A verify URL written in the reset shape (`/admin/verify/:token`) matches nothing, and **fails silently instead of 404ing**: `isPublicAdminRoute` returns true for any route containing `/verify/`, so the auth gate never fires and a logged-out recipient lands on the login form. It looks exactly like the email never arrived, and it shipped that way from #483 to #320.

You will not reproduce this locally — `admin.autoLogin` makes `req.user` truthy on every dev request, taking the `notFound()` branch and showing a 404 instead. Open the link in a **private window**. `manager-invite.spec.ts` is what pins the shape now, by asserting the old `/admin/managers/verify/:token` no longer appears; `manager-auth-urls.spec.ts` went with the reset route it existed for. A template render spec cannot catch this either way: it asserts a URL round-trips, and a wrong URL round-trips just as happily.
