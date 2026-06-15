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
| `EmailLayout.tsx` | Shared shell — gradient brand header, card body, footer. Exports `BrandButton` + shared `styles`. |
| `VerifyEmail.tsx` | Managers email-verification message. |
| `ResetPasswordEmail.tsx` | Managers password-reset message (replaces Payload's bare default). |

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

- **Preview**: render a template in a unit test
  (`tests/unit/email-templates.spec.ts`), or run the `react-email` CLI's local
  preview server against `src/emails/` (`pnpm exec email dev`).

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
