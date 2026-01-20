/**
 * Rate Limiting Documentation for OpenAPI
 *
 * Defines the X-User-ID header parameter for per-user rate limiting documentation.
 * This parameter appears in the Scalar API documentation UI.
 */

/**
 * X-User-ID header parameter definition for OpenAPI spec.
 *
 * This header enables per-user rate limiting, allowing multiple users
 * sharing the same API key to have separate rate limit quotas.
 */
export const xUserIdParameter = {
  name: 'X-User-ID',
  in: 'header' as const,
  required: false,
  schema: {
    type: 'string',
    pattern: '^[a-zA-Z0-9-_]{8,64}$',
    minLength: 8,
    maxLength: 64,
  },
  description: `**Optional User Identifier for Per-User Rate Limiting**

To prevent rate limit exhaustion when multiple users share the same API key, provide a unique user identifier via the X-User-ID header.

**Rate Limits:**
- With X-User-ID: 500 requests/min per (API key + IP + User ID)
- Without X-User-ID: 500 requests/min per (API key + IP)

**Format Requirements:**
- Length: 8-64 characters
- Allowed characters: alphanumeric (a-z, A-Z, 0-9), dash (-), underscore (_)

**Example:**
\`\`\`
curl -H "Authorization: clients API-Key YOUR_KEY" \\
     -H "X-User-ID: abc123-device-uuid" \\
     https://cloud.sydevelopers.com/api/meditations
\`\`\``,
}
