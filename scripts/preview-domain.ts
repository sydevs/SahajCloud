#!/usr/bin/env node
/**
 * Create and sweep the fixed per-PR preview addresses in front of Railway.
 *
 * `create` runs on every push to a pull request, from `ci.yml`, once the
 * Railway host is discovered. It registers a Workers Custom Domain at
 * `pr-<n>.cloud-preview.sydevelopers.com`, writes the KV mapping the Worker
 * reads, and waits for the address to answer. ⚠ **It takes the Railway host as
 * an argument and never builds one**: Railway appends a random suffix to some
 * generated domains, so a constructed host turns #661's loud failure into a 502.
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
 *   pnpm tsx scripts/preview-domain.ts sweep --apply     # or --force
 *
 * Env required:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_KEY          Workers KV Storage:Edit, Workers Scripts:Edit,
 *                               Zone:Read, and the zone's Workers Routes:Edit — the
 *                               Custom Domain attach needs that last one
 *   CLOUDFLARE_ZONE_ID          the sydevelopers.com zone
 *   PREVIEW_KV_NAMESPACE_ID     the Worker's PREVIEW_HOSTS namespace
 * Also for `sweep`:
 *   GITHUB_TOKEN, GITHUB_REPOSITORY   to read which pull requests are closed
 * Optional:
 *   PREVIEW_WORKER_NAME         default `sahajcloud-preview-proxy`
 */
import {
  previewHostKey,
  previewHostname,
  previewNumberFromProxyHost,
} from '../src/lib/preview/proxy'
import { cfFetch, requireEnv } from './lib/cloudflare'
import { sweepTargets, type PreviewDomain, type PullRequestState } from './preview-domain-plan'

const WORKER_NAME = process.env.PREVIEW_WORKER_NAME || 'sahajcloud-preview-proxy'
/** A PR reopened within the day keeps its address, and its certificate. */
const SWEEP_GRACE_MS = 24 * 60 * 60_000
/**
 * How long to wait for a fresh Custom Domain's certificate, and how often to look.
 *
 * ⚠ The old 3-minute bound sat on top of the real provisioning time: two first
 * attaches minutes apart answered at 2m32s and past 3m, so the second failed CI
 * (#1129). A generous bound costs nothing — the loop returns on the first answer.
 */
const REACHABLE_TIMEOUT_MS = 10 * 60_000
const REACHABLE_POLL_MS = 10_000

/**
 * The Railway hosts this script will write into KV.
 *
 * ⚠ **The KV value is what the Worker proxies to, carrying the shared secret
 * and the caller's Access session with it**, so a wrong one would hand both to
 * whatever host it named. `scripts/get-railway-preview-url.ts` already
 * constrains its output to this shape; asserting it here makes that a guarantee
 * rather than a convention.
 */
const RAILWAY_HOST = /^[a-z0-9-]+\.(?:up\.)?railway\.app$/i

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait until the fixed address completes a TLS handshake and answers anything at all. */
async function waitReachable(hostname: string): Promise<void> {
  const deadline = Date.now() + REACHABLE_TIMEOUT_MS
  let last = 'no attempt'
  for (let attempt = 1; Date.now() < deadline; attempt++) {
    try {
      const res = await fetch(`https://${hostname}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      console.error(`https://${hostname} answered ${res.status} after ${attempt} attempt(s)`)
      return
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
      console.error(`reachability attempt ${attempt}: ${last}`)
    }
    await sleep(REACHABLE_POLL_MS)
  }
  // ⚠ Titled `infrastructure-failure` because the sydevs dispatcher matches an error
  // annotation's TITLE, and re-runs such a job instead of dispatching a session to
  // repair it. Neither cause below is repairable from a PR's branch (#1129).
  console.error(
    `::error title=infrastructure-failure::https://${hostname} was attached but did ` +
      `not answer within ${REACHABLE_TIMEOUT_MS / 60_000} minutes (${last}). Its edge ` +
      `certificate may still be provisioning, or the Worker is not deployed.`,
  )
  process.exit(1)
}

async function create(pr: string, railwayHost: string): Promise<void> {
  const account = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const namespace = requireEnv('PREVIEW_KV_NAMESPACE_ID')
  const zone = requireEnv('CLOUDFLARE_ZONE_ID')
  const hostname = previewHostname(pr)

  if (!RAILWAY_HOST.test(railwayHost)) {
    console.error(
      `--host ${railwayHost} is not a Railway host. Refusing to map ${hostname} to it: the ` +
        `Worker sends the shared secret and the caller's Access session to whatever this names.`,
    )
    process.exit(1)
  }

  // The mapping first: the Worker answers 503 with a hostname and no mapping,
  // and 404 with neither, so writing KV first means the address is never live
  // pointing at nothing.
  await cfFetch(
    'PUT',
    `/accounts/${account}/storage/kv/namespaces/${namespace}/values/${previewHostKey(pr)}`,
    { body: railwayHost, contentType: 'text/plain' },
  )
  console.error(`KV ${previewHostKey(pr)} → ${railwayHost}`)

  // ⚠ **`PUT`, not `POST`.** Cloudflare's attach-domain operation is a PUT and
  // answers a POST 405, which would fail this CI step before the preview was
  // ever reachable. Being an upsert is also what makes "every push runs this"
  // free: a second push gets a 200 rather than a conflict, so there is no error
  // to swallow — and a REAL conflict, a hostname already holding a CNAME, still
  // fails loudly. Swallowing that one had CI seed and smoke an address the
  // Worker does not serve. It is also why this key cannot take over the live
  // `cloud.sydevelopers.com`.
  await cfFetch('PUT', `/accounts/${account}/workers/domains`, {
    body: JSON.stringify({ hostname, service: WORKER_NAME, zone_id: zone }),
  })
  console.error(`attached https://${hostname}`)

  // ⚠ **Attached is not reachable yet.** A fresh Custom Domain provisions its
  // edge certificate asynchronously, and the steps after this one — the fill and
  // the smoke lane — assume the address answers. Any HTTP response proves the
  // handshake, so the Access login page counts.
  await waitReachable(hostname)

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
  const repo = requireEnv('GITHUB_REPOSITORY')
  const token = requireEnv('GITHUB_TOKEN')
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
  const account = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const namespace = requireEnv('PREVIEW_KV_NAMESPACE_ID')

  const domains = await listDomains(account)
  console.error(`${domains.length} Custom Domain(s) on ${WORKER_NAME}`)

  const numbers = domains.flatMap((d) => previewNumberFromProxyHost(d.hostname) ?? [])
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
    const reason = `pull request #${target.pr} closed ${target.closedAt}`
    if (!apply) {
      console.error(`would delete ${target.hostname} (${reason})`)
      continue
    }
    await cfFetch('DELETE', `/accounts/${account}/workers/domains/${target.domainId}`)
    await cfFetch(
      'DELETE',
      `/accounts/${account}/storage/kv/namespaces/${namespace}/values/${previewHostKey(target.pr)}`,
    )
    console.error(`deleted ${target.hostname} (${reason})`)
  }

  console.error(
    `${apply ? 'Deleted' : 'Would delete'} ${targets.length} address(es). The Advanced ` +
      `Certificate each one generated is NOT removed by this — clear those by hand.`,
  )
}

const KNOWN_FLAGS = new Set(['--apply', '--force', '--host', '--pr'])

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? undefined : argv[at + 1]
  }

  // ⚠ **Refuse an unknown argument rather than ignoring it.** `sweep` deletes
  // live preview addresses, so a typo'd `--aply` silently became a dry run the
  // operator believed was the real thing — and on `create`, a typo'd `--prs`
  // mapped nothing while exiting 0.
  const values = new Set([flag('host'), flag('pr')])
  const unknown = argv
    .slice(1)
    .filter((arg) => (arg.startsWith('--') ? !KNOWN_FLAGS.has(arg) : !values.has(arg)))
  if (unknown.length > 0) {
    console.error(`Unrecognised argument(s): ${unknown.join(' ')}`)
    process.exit(1)
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
    // `--force` beside `--apply`, as `scripts/AGENTS.md` asks of any script that
    // changes state.
    await sweep(argv.includes('--apply') || argv.includes('--force'))
    return
  }

  console.error('Usage: preview-domain.ts <create|sweep> [options] — see the file header.')
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
