#!/usr/bin/env node
/**
 * Discover the Railway PR-preview URL for the current pull request, wait until it
 * is healthy, and export it as PREVIEW_URL for the Playwright smoke specs.
 *
 * Railway does not push per-PR preview URLs into GitHub Actions, so CI calls this
 * to look the URL up via the Railway GraphQL API and health-poll it (the Railway
 * deploy is async from the CI run).
 *
 * Auth: a Railway **project token** via the `Project-Access-Token` header
 * (account tokens would use `Authorization: Bearer`; ours is a project token).
 *
 * Env:
 *   RAILWAY_API_TOKEN   - Railway project token (required)
 *   RAILWAY_PROJECT_ID  - project id (default: the sahajcloud project)
 *   RAILWAY_SERVICE     - app service name (default: "SahajCloud")
 *   RAILWAY_ENV_NAME    - target environment name (default: GITHUB_HEAD_REF)
 *   PR_NUMBER           - PR number, used as a fallback env-name match (pr-<n>)
 *   HEALTH_PATH         - health endpoint (default: "/api/health")
 *
 * Behavior: if no matching PR environment is found within DISCOVER_TIMEOUT, it
 * logs and exits 0 with an empty preview_url so callers can skip smoke gracefully
 * (e.g. PRs whose branch is itself a deployed environment have no preview env).
 * Writes `preview_url=<url>` to $GITHUB_OUTPUT and `PREVIEW_URL=<url>` to
 * $GITHUB_ENV when present; also prints the URL to stdout.
 */
import { appendFileSync } from 'node:fs'

const TOKEN = process.env.RAILWAY_API_TOKEN
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID || 'bdff2c72-5af2-4da3-9e2c-913f5e9d1b0f'
const SERVICE = process.env.RAILWAY_SERVICE || 'SahajCloud'
const HEALTH_PATH = process.env.HEALTH_PATH || '/api/health'
const ENV_NAME = process.env.RAILWAY_ENV_NAME || process.env.GITHUB_HEAD_REF || ''
const PR_NUMBER = process.env.PR_NUMBER || ''

const GQL_ENDPOINT = 'https://backboard.railway.com/graphql/v2'
const DISCOVER_TIMEOUT_MS = 5 * 60_000 // wait up to 5 min for the PR env to appear
const HEALTH_TIMEOUT_MS = 10 * 60_000 // then up to 10 min for it to go healthy
const POLL_INTERVAL_MS = 15_000

const PROJECT_QUERY = `query($id: String!) {
  project(id: $id) {
    name
    environments { edges { node { id name } } }
    services {
      edges { node {
        name
        serviceInstances { edges { node {
          environmentId
          domains { serviceDomains { domain } }
        } } }
      } }
    }
  }
}`

interface EnvNode {
  id: string
  name: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function gql(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Project-Access-Token': TOKEN as string,
      'Content-Type': 'application/json',
      'User-Agent': 'sahajcloud-preview-discovery',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Railway GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}

function matchEnv(envs: EnvNode[]): EnvNode | null {
  if (ENV_NAME) {
    const exact = envs.find((e) => e.name === ENV_NAME)
    if (exact) return exact
  }
  if (PR_NUMBER) {
    const byPr = envs.find((e) => e.name === `pr-${PR_NUMBER}` || e.name.includes(PR_NUMBER))
    if (byPr) return byPr
  }
  return null
}

async function discoverDomain(): Promise<string | null> {
  const data = await gql(PROJECT_QUERY, { id: PROJECT_ID })
  const project = data.project
  const envs: EnvNode[] = project.environments.edges.map((e: any) => e.node)
  console.error(`environments: ${envs.map((e) => e.name).join(', ') || '(none)'}`)
  const env = matchEnv(envs)
  if (!env) return null
  console.error(`matched environment '${env.name}' (${env.id})`)
  for (const s of project.services.edges) {
    if (s.node.name !== SERVICE) continue
    for (const si of s.node.serviceInstances.edges) {
      if (si.node.environmentId !== env.id) continue
      const domain = si.node.domains.serviceDomains[0]?.domain
      if (domain) return `https://${domain}`
    }
  }
  throw new Error(`environment '${env.name}' has no domain for service '${SERVICE}' yet`)
}

async function waitHealthy(url: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    try {
      const res = await fetch(`${url}${HEALTH_PATH}`, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        console.error(`preview healthy after ${attempt} attempt(s)`)
        return true
      }
      console.error(`health attempt ${attempt}: HTTP ${res.status}`)
    } catch (err) {
      console.error(`health attempt ${attempt}: ${(err as Error).message}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return false
}

function exportUrl(url: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${url}\n`)
  if (url && process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `PREVIEW_URL=${url}\n`)
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('RAILWAY_API_TOKEN not set — skipping preview discovery (smoke will skip).')
    exportUrl('')
    return
  }
  // The PR env may not exist immediately after the PR opens — retry discovery.
  const deadline = Date.now() + DISCOVER_TIMEOUT_MS
  let url: string | null = null
  while (!url && Date.now() < deadline) {
    try {
      url = await discoverDomain()
    } catch (err) {
      console.error(`discovery: ${(err as Error).message}; retrying...`)
    }
    if (!url) await sleep(POLL_INTERVAL_MS)
  }

  if (!url) {
    console.error('No matching PR preview environment found — skipping smoke.')
    exportUrl('')
    return
  }

  console.error(`preview URL: ${url}`)
  if (!(await waitHealthy(url))) {
    console.error('Preview environment never became healthy.')
    process.exit(1)
  }
  exportUrl(url)
  console.log(url)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
