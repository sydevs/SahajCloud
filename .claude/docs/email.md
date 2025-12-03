# Email Configuration

The application uses different email providers based on the environment:

## Development Environment

- **Provider**: Ethereal Email (automatic test email service via `@payloadcms/email-nodemailer`)
- **Features**: Captures all outbound emails for testing without sending real emails
- **Configuration**: No setup required - automatically configured when no transport options are provided
- **Testing**: Access mock emails at https://ethereal.email using generated credentials shown in console
- **From Address**: dev@wemeditate.com

## Production Environment

- **Provider**: Resend (transactional email API)
- **Implementation**: Custom adapter at [src/lib/email/resendAdapter.ts](../../src/lib/email/resendAdapter.ts)
- **Email Address**: contact@sydevelopers.com
- **Benefits**:
  - Free tier includes 3,000 emails/month
  - Better deliverability than SMTP
  - Simple HTTP API
  - Detailed analytics and logs

## Test Environment

- **Provider**: Disabled (email configuration is disabled in test environment to prevent model conflicts)
- **Reason**: Prevents Payload model conflicts during parallel test execution
- **Testing**: Email logic can be tested separately without full Payload initialization

## Environment Variables

```env
# Production - Resend API
RESEND_API_KEY=your-resend-api-key-here
```

## Implementation Details

- **Adapter**: Custom Resend adapter implements PayloadCMS `EmailAdapter` interface
- **Error Handling**: Graceful fallback if API key is missing (logs error, returns error message ID)
- **Logging**: All email operations logged for debugging
- **Configuration**: Email adapter selection based on `NODE_ENV` in [src/payload.config.ts](../../src/payload.config.ts)

## Authentication Features

- **Email Verification**: Uses Payload's default email verification flow
- **Password Reset**: Uses Payload's default password reset functionality
- **Automatic Emails**: Sent for user registration and password reset requests using default templates
