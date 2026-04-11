#!/usr/bin/env node
/**
 * One-off script to register (or delete) a Cloudflare Stream webhook.
 *
 * The Cloudflare Stream webhook is **account-scoped**: only one notification
 * URL exists per account. Running this script against the wrong URL will
 * silently break production. Only run from an operator machine, pointing at
 * the production deployment.
 *
 * Usage:
 *   pnpm tsx scripts/setup-stream-webhook.ts --url <https-url>
 *   pnpm tsx scripts/setup-stream-webhook.ts --url <https-url> --force
 *   pnpm tsx scripts/setup-stream-webhook.ts --delete
 *   pnpm tsx scripts/setup-stream-webhook.ts --get
 *
 * Env vars required:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_KEY  (token with Stream:Edit permission)
 *
 * After running with --url, copy the printed signing secret into Workers:
 *   wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET
 */
import { z } from 'zod'

const EXPECTED_HOST = 'cloud.sydevelopers.com'

const WebhookResponseSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ code: z.number().optional(), message: z.string() }))
    .default([]),
  result: z
    .object({
      notificationUrl: z.string().optional(),
      modified: z.string().optional(),
      secret: z.string().optional(),
    })
    .nullable()
    .optional(),
})

interface Args {
  url?: string
  force: boolean
  delete: boolean
  get: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, delete: false, get: false }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--url') {
      args.url = argv[++i]
    } else if (arg === '--force') {
      args.force = true
    } else if (arg === '--delete') {
      args.delete = true
    } else if (arg === '--get') {
      args.get = true
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${arg}`)
      printUsage()
      process.exit(1)
    }
  }
  return args
}

function printUsage(): void {
  console.error(
    [
      'Usage:',
      '  pnpm tsx scripts/setup-stream-webhook.ts --url <https-url> [--force]',
      '  pnpm tsx scripts/setup-stream-webhook.ts --delete',
      '  pnpm tsx scripts/setup-stream-webhook.ts --get',
      '',
      'Env required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY',
    ].join('\n'),
  )
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

async function cf(
  method: 'GET' | 'PUT' | 'DELETE',
  accountId: string,
  apiKey: string,
  body?: unknown,
): Promise<z.infer<typeof WebhookResponseSchema>> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`,
    {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  )
  const json = await response.json()
  return WebhookResponseSchema.parse(json)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const apiKey = requireEnv('CLOUDFLARE_API_KEY')

  if (args.get) {
    const result = await cf('GET', accountId, apiKey)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (args.delete) {
    if (args.url) {
      console.error('--delete and --url are mutually exclusive')
      process.exit(1)
    }
    const result = await cf('DELETE', accountId, apiKey)
    if (!result.success) {
      console.error('Failed to delete webhook:', result.errors)
      process.exit(1)
    }
    console.log('Webhook deleted.')
    return
  }

  if (!args.url) {
    console.error('Missing --url')
    printUsage()
    process.exit(1)
  }

  if (!args.url.startsWith('https://')) {
    console.error('--url must be an HTTPS URL')
    process.exit(1)
  }

  if (!args.url.includes(EXPECTED_HOST)) {
    console.error(
      `\n  \x1b[33m⚠ WARNING\x1b[0m: URL does not contain "${EXPECTED_HOST}". Cloudflare Stream webhooks are account-scoped — you will overwrite the production registration. Proceed only if this is intentional.\n`,
    )
  }

  // Inspect current registration first
  const current = await cf('GET', accountId, apiKey)
  const currentUrl = current.result?.notificationUrl
  if (
    current.success &&
    currentUrl &&
    currentUrl !== args.url &&
    !args.force
  ) {
    console.error(
      `\nRefusing to overwrite existing webhook.\n  Current: ${currentUrl}\n  New:     ${args.url}\n\nPass --force to override.\n`,
    )
    process.exit(1)
  }

  const result = await cf('PUT', accountId, apiKey, { notificationUrl: args.url })
  if (!result.success) {
    console.error('Failed to register webhook:', result.errors)
    process.exit(1)
  }

  const secret = result.result?.secret
  if (!secret) {
    console.error('Cloudflare did not return a signing secret. Response:', result)
    process.exit(1)
  }

  console.log('')
  console.log('Webhook registered.')
  console.log(`  Notification URL: ${args.url}`)
  console.log(`  Signing secret:   ${secret}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Copy the signing secret above.')
  console.log('  2. Run: wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET')
  console.log('  3. Paste the secret when prompted.')
  console.log('  4. Deploy: pnpm run deploy:prod')
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
