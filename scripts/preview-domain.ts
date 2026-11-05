#!/usr/bin/env node
/**
 * Create and sweep the fixed per-PR preview addresses in front of Railway.
 *
 * `create` runs on every push to a pull request, from `ci.yml`, once the
 * Railway host is discovered. It registers a Workers Custom Domain at
 * `pr-<n>.cloud-preview.sydevelopers.com` and writes the KV mapping the Worker
 * reads. ⚠ **It takes the Railway host as an argument and never builds one**:
 * Railway appends a random suffix to some generated domains, so a constructed
 * host turns #661's loud failure into a 502.
 *
 * `sweep` runs nightly beside `cleanup-preview-assets.ts` and deletes the
 * address and KV key of a pull request closed more than a day ago. It defends
 * two per-zone ceilings rather than tidying: 100 Custom Domains per zone, and
 * the Advanced Certificate each one generates. ⚠ **Deleting a Custom Domain
 * does not delete that certificate** — those are cleared by hand, and are known
 * residue this script cannot reach.
 *
 * Usage:
 *   pnpm tsx scripts/preview-domain.ts create --pr 470 --host sahajcloud-…up.railway.app
 *   pnpm tsx scripts/preview-domain.ts sweep             # dry run
 *   pnpm tsx scripts/preview-domain.ts sweep --apply
 *
 * Env required:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_KEY          Workers Scripts:Edit, Workers KV:Edit, Zone:Read
 *   CLOUDFLARE_ZONE_ID          the sydevelopers.com zone
 *   PREVIEW_KV_NAMESPACE_ID     the Worker's PREVIEW_HOSTS namespace
 * Also for `sweep`:
 *   GITHUB_TOKEN, GITHUB_REPOSITORY   to read which pull requests are closed
 * Optional:
 *   PREVIEW_WORKER_NAME         default `sahajcloud-preview-proxy`
 */
import { previewHostKey, previewHostname } from '../src/lib/preview/proxy'
import { sweepTargets, type PreviewDomain, type PullRequestState } from './preview-domain-plan'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const WORKER_NAME = process.env.PREVIEW_WORKER_NAME || 'sahajcloud-preview-proxy'
/** A PR reopened within the day keeps its address, and its certificate. */
const SWEEP_GRACE_MS = 24 * 60 * 60_000

interface CloudflareEnvelope {
  errors?: { code?: number; message?: string }[]
  result?: unknown
  success?: boolean
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`${name} is not set. See this script's header for the full list.`)
    process.exit(1)
  }
  return value
}

async function cfFetch(
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
  path: string,
  init?: { body?: string; contentType?: string },
): Promise<CloudflareEnvelope> {
  const res = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${required('CLOUDFLARE_API_KEY')}`,
      ...(init?.body ? { 'Content-Type': init.contentType ?? 'application/json' } : {}),
    },
    body: init?.body,
  })

  // A KV write answers with an empty body on success, so parse defensively
  // rather than assuming an envelope.
  const text = await res.text()
  const parsed: CloudflareEnvelope = text ? (JSON.parse(text) as CloudflareEnvelope) : {}
  if (!res.ok && parsed.success !== true) {
    const detail = parsed.errors?.map((e) => `${e.code}: ${e.message}`).join('; ')
    throw new Error(
      `Cloudflare ${method} ${path}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`,
    )
  }
  return parsed
}

/** The hostname is already taken by this same Worker — the second push's case. */
const alreadyAttached = (error: unknown): boolean =>
  /already|duplicate|exists/i.test(error instanceof Error ? error.message : String(error))

async function create(pr: string, railwayHost: string): Promise<void> {
  const account = required('CLOUDFLARE_ACCOUNT_ID')
  const namespace = required('PREVIEW_KV_NAMESPACE_ID')
  const hostname = previewHostname(pr)

  // The mapping first: the Worker answers 503 with a hostname and no mapping,
  // and 404 with neither, so writing KV first means the address is never live
  // pointing at nothing.
  await cfFetch(
    'PUT',
    `/accounts/${account}/storage/kv/namespaces/${namespace}/values/${previewHostKey(pr)}`,
    { body: railwayHost, contentType: 'text/plain' },
  )
  console.error(`KV ${previewHostKey(pr)} → ${railwayHost}`)

  try {
    await cfFetch('POST', `/accounts/${account}/workers/domains`, {
      body: JSON.stringify({
        environment: 'production',
        hostname,
        service: WORKER_NAME,
        zone_id: required('CLOUDFLARE_ZONE_ID'),
      }),
    })
    console.error(`created https://${hostname}`)
  } catch (error) {
    // ⚠ **Every push runs this**, so an existing domain is the normal case and
    // must exit 0. A hostname that already holds a CNAME is refused the same
    // way, which is also why this key cannot take over the live
    // `cloud.sydevelopers.com`.
    if (!alreadyAttached(error)) throw error
    console.error(`https://${hostname} already exists — nothing to create`)
  }

  console.log(`https://${hostname}`)
}

async function listDomains(account: string): Promise<PreviewDomain[]> {
  const envelope = await cfFetch(
    'GET',
    `/accounts/${account}/workers/domains?service=${encodeURIComponent(WORKER_NAME)}`,
  )
  const result = Array.isArray(envelope.result) ? envelope.result : []
  return result.flatMap((row) => {
    const { hostname, id } = row as { hostname?: unknown; id?: unknown }
    return typeof hostname === 'string' && typeof id === 'string' ? [{ hostname, id }] : []
  })
}

async function listPullRequests(numbers: string[]): Promise<PullRequestState[]> {
  const repo = required('GITHUB_REPOSITORY')
  const token = required('GITHUB_TOKEN')
  const states: PullRequestState[] = []

  // One read per address rather than a paginated list of every pull request:
  // the sweep is bounded by the 100-domain ceiling, and a PR past the list's
  // first pages would otherwise read as unknown and be left forever.
  for (const number of numbers) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'sahajcloud-preview-domain-sweep',
      },
    })
    if (res.status === 404) {
      console.error(`pull request #${number}: not in ${repo} — left alone`)
      continue
    }
    if (!res.ok) {
      console.error(`pull request #${number}: HTTP ${res.status} — left alone`)
      continue
    }
    const body = (await res.json()) as { closed_at?: null | string }
    states.push({ closedAt: body.closed_at ?? null, number: Number(number) })
  }

  return states
}

async function sweep(apply: boolean): Promise<void> {
  const account = required('CLOUDFLARE_ACCOUNT_ID')
  const namespace = required('PREVIEW_KV_NAMESPACE_ID')

  const domains = await listDomains(account)
  console.error(`${domains.length} Custom Domain(s) on ${WORKER_NAME}`)

  const numbers = domains.flatMap((d) => /^pr-(\d+)\./.exec(d.hostname)?.[1] ?? [])
  const targets = sweepTargets({
    domains,
    graceMs: SWEEP_GRACE_MS,
    now: Date.now(),
    pullRequests: await listPullRequests(numbers),
  })

  if (targets.length === 0) {
    console.error('Nothing to sweep.')
    return
  }

  for (const target of targets) {
    if (!apply) {
      console.error(`would delete ${target.hostname} (${target.reason})`)
      continue
    }
    await cfFetch('DELETE', `/accounts/${account}/workers/domains/${target.domainId}`)
    await cfFetch(
      'DELETE',
      `/accounts/${account}/storage/kv/namespaces/${namespace}/values/${previewHostKey(target.pr)}`,
    )
    console.error(`deleted ${target.hostname} (${target.reason})`)
  }

  console.error(
    `${apply ? 'Deleted' : 'Would delete'} ${targets.length} address(es). The Advanced ` +
      `Certificate each one generated is NOT removed by this — clear those by hand.`,
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? undefined : argv[at + 1]
  }

  if (command === 'create') {
    const pr = flag('pr')
    const host = flag('host')
    if (!pr || !host) {
      console.error('Usage: preview-domain.ts create --pr <number> --host <railway host>')
      process.exit(1)
    }
    await create(pr, host.replace(/^https?:\/\//, '').replace(/\/$/, ''))
    return
  }

  if (command === 'sweep') {
    await sweep(argv.includes('--apply'))
    return
  }

  console.error('Usage: preview-domain.ts <create|sweep> [options] — see the file header.')
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
