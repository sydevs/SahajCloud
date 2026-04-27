---
paths:
  - src/lib/email/**/*.ts
---

# Email Configuration

The application uses different email providers based on environment:

| Environment | Provider | Notes |
|---|---|---|
| Development | Ethereal Email (auto, via `@payloadcms/email-nodemailer`) | Captures outbound mail at https://ethereal.email — credentials printed to console. From `dev@wemeditate.com`. |
| Production | Resend (transactional API) | Custom adapter at `src/lib/email/resendAdapter.ts`. From `contact@sydevelopers.com`. Free tier 3,000 emails/month. |
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

## Authentication features

- Email verification + password reset use Payload's default flow and templates.
