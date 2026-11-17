#!/usr/bin/env node
/**
 * Let a Railway PR preview sleep when idle: Serverless on its app and, once the
 * commit it runs retries while Postgres wakes, on its Postgres too, with
 * point-in-time recovery off. What changes, and in what order, is
 * `preview-sleep-plan.ts`.
 *
 * Runs from `.github/workflows/preview-sleep.yml` each time CI finishes with a
 * PR, so a preview sleeps only after CI is done with it. Running it again
 * changes nothing.
 *
 * ⚠ **Previews need this because Railway gives them no override of their own.**
 * A PR environment copies production's settings once, when Railway creates it,
 * and production must never sleep. Config as Code's `environments.pr` block was
 * the way to say otherwise, and Railway stops reading it on 2026-12-01.
 *
 * Usage:
 *   pnpm tsx scripts/preview-sleep.ts --pr 1185            # dry run
 *   pnpm tsx scripts/preview-sleep.ts --all --apply        # or --force
 *
 * Needs the Railway CLI, signed in or given `RAILWAY_API_TOKEN` (a workspace
 * token: a project token reaches one environment, and every preview is its
 * own), and `gh`, signed in or given `GH_TOKEN`.
 */
import { execFileSync } from 'node:child_process'

import { previewNumberFromEnvironmentName } from '../src/lib/preview/proxy'
import {
  type DeploymentState,
  planPreviewSleep,
  type PreviewState,
  type SleepAction,
} from './preview-sleep-plan'

const PROJECT_ID = 'bdff2c72-5af2-4da3-9e2c-913f5e9d1b0f'
const APP_SERVICE = 'SahajCloud'
const POSTGRES_SERVICE = 'Postgres'
const PRODUCTION = 'production'
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'sydevs/SahajCloud'
/**
 * The file whose presence at a commit says its app retries while Postgres
 * wakes. ⚠ Keep it in step with `src/plugins/postgresWake/`: if the file moves,
 * every preview's Postgres quietly stays awake.
 */
const WAKE_RETRY_PATH = 'src/plugins/postgresWake/wakeRetry.ts'

interface Environment {
  id: string
  isEphemeral: boolean
  name: string
  sourceEnvironment: null | { id: string }
}

interface Ids {
  appId: string
  environments: Environment[]
  postgresId: string
  production: Environment
}

class RailwayError extends Error {}

/** One Railway GraphQL call through the CLI, which carries whichever credential it holds. */
function railwayApi<T>(query: string, variables: Record<string, string> = {}): T {
  const args = ['api', query, '--compact']
  for (const [key, value] of Object.entries(variables)) args.push('--raw-var', `${key}=${value}`)
  let stdout: string
  try {
    stdout = execFileSync('railway', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const { stderr = '', stdout: out = '' } = error as { stderr?: string; stdout?: string }
    throw new RailwayError(`Railway API call failed: ${out.trim() || stderr.trim()}`)
  }
  const body = JSON.parse(stdout) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length || !body.data) {
    throw new RailwayError(`Railway API error: ${body.errors?.map((e) => e.message).join('; ')}`)
  }
  return body.data
}

function railwayCli(args: string[]): string {
  return execFileSync('railway', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function loadIds(): Ids {
  const { project } = railwayApi<{
    project: {
      environments: { edges: { node: Environment }[] }
      services: { edges: { node: { id: string; name: string } }[] }
    }
  }>(
    `query($p: String!) { project(id: $p) {
      services { edges { node { id name } } }
      environments { edges { node { id name isEphemeral sourceEnvironment { id } } } }
    } }`,
    { p: PROJECT_ID },
  )
  const service = (name: string) => {
    const found = project.services.edges.find((e) => e.node.name === name)
    if (!found) throw new RailwayError(`No service named ${name} in the project`)
    return found.node.id
  }
  const environments = project.environments.edges.map((e) => e.node)
  const production = environments.find((e) => e.name === PRODUCTION)
  if (!production) throw new RailwayError('No production environment in the project')
  return {
    appId: service(APP_SERVICE),
    environments,
    postgresId: service(POSTGRES_SERVICE),
    production,
  }
}

/**
 * The PR previews this may change.
 *
 * ⚠ **Every condition here keeps production out**, because a settings update
 * given an environment that is not a fork applies to every environment that is
 * not one — production included (`serviceInstanceUpdate`'s own description). A
 * PR environment is ephemeral and forked from production.
 */
function previewEnvironments(ids: Ids): Map<string, Environment> {
  const previews = new Map<string, Environment>()
  for (const env of ids.environments) {
    const pr = previewNumberFromEnvironmentName(env.name)
    if (
      pr &&
      env.isEphemeral &&
      env.id !== ids.production.id &&
      env.sourceEnvironment?.id === ids.production.id
    ) {
      previews.set(pr, env)
    }
  }
  return previews
}

interface InstanceRead {
  latestDeployment: null | {
    meta: null | {
      commitHash?: string
      serviceManifest?: { deploy?: { sleepApplication?: boolean } }
    }
    status: string
  }
  sleepApplication: boolean | null
}

function readInstance(environmentId: string, serviceId: string): InstanceRead {
  return railwayApi<{ serviceInstance: InstanceRead }>(
    `query($e: String!, $s: String!) { serviceInstance(environmentId: $e, serviceId: $s) {
      sleepApplication latestDeployment { status meta }
    } }`,
    { e: environmentId, s: serviceId },
  ).serviceInstance
}

const deploymentState = (read: InstanceRead): DeploymentState | null =>
  read.latestDeployment && {
    commitHash: read.latestDeployment.meta?.commitHash,
    manifestSleeps: read.latestDeployment.meta?.serviceManifest?.deploy?.sleepApplication === true,
    status: read.latestDeployment.status,
  }

function pitrEnabled(environment: string): boolean {
  const out = railwayCli([
    ...['postgres', 'pitr', 'status', '--json'],
    ...['-p', PROJECT_ID, '-e', environment, '-s', POSTGRES_SERVICE],
  ])
  return (JSON.parse(out) as { enabled: boolean }).enabled
}

/** Whether `commit` carries the connection retry, so its preview survives a sleeping Postgres. */
function runsWakeRetry(commit: string): boolean {
  try {
    execFileSync(
      'gh',
      ['api', '--silent', `repos/${REPOSITORY}/contents/${WAKE_RETRY_PATH}?ref=${commit}`],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    return true
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '')
    if (stderr.includes('HTTP 404')) return false
    throw new Error(`Could not read ${WAKE_RETRY_PATH} at ${commit}: ${stderr.trim()}`)
  }
}

function describe(action: SleepAction): string {
  switch (action.kind) {
    case 'deploy':
      return action.service === 'app'
        ? `deploy the app fresh at ${action.commit.slice(0, 8)}`
        : 'deploy Postgres fresh'
    case 'disable-pitr':
      return "turn off Postgres's point-in-time recovery"
    case 'set-sleep':
      return `turn on Serverless for ${action.service === 'app' ? 'the app' : 'Postgres'}`
  }
}

function apply(action: SleepAction, env: Environment, ids: Ids): void {
  const serviceId = (service: 'app' | 'postgres') =>
    service === 'app' ? ids.appId : ids.postgresId
  switch (action.kind) {
    case 'set-sleep':
      railwayApi(
        `mutation($e: String!, $s: String!) {
          serviceInstanceUpdate(environmentId: $e, serviceId: $s, input: { sleepApplication: true })
        }`,
        { e: env.id, s: serviceId(action.service) },
      )
      return
    case 'disable-pitr':
      // --no-deploy: the fresh deploy that follows carries this and the sleep setting at once.
      railwayCli([
        ...['postgres', 'pitr', 'disable', '--yes', '--no-deploy', '--json'],
        ...['-p', PROJECT_ID, '-e', env.name, '-s', POSTGRES_SERVICE],
      ])
      return
    case 'deploy':
      // A fresh deployment, not a redeploy: a redeploy reuses the old settings snapshot.
      if (action.service === 'app') {
        railwayApi(
          `mutation($e: String!, $s: String!, $c: String!) {
            serviceInstanceDeployV2(environmentId: $e, serviceId: $s, commitSha: $c)
          }`,
          { c: action.commit, e: env.id, s: ids.appId },
        )
      } else {
        railwayApi(
          `mutation($e: String!, $s: String!) {
            serviceInstanceDeployV2(environmentId: $e, serviceId: $s)
          }`,
          { e: env.id, s: ids.postgresId },
        )
      }
  }
}

/**
 * Fail loudly if production would sleep. Read before and after every write: a
 * production that sleeps answers its first request after an idle spell with a
 * 502, and Railway de-prioritizes a Serverless workload.
 */
function assertProductionAwake(ids: Ids): void {
  for (const [name, serviceId] of [
    [APP_SERVICE, ids.appId],
    [POSTGRES_SERVICE, ids.postgresId],
  ]) {
    if (readInstance(ids.production.id, serviceId).sleepApplication) {
      throw new Error(
        `⚠ Serverless is ON for ${name} in production. Turn it off on the service ` +
          '(Settings → Deploy → Serverless) and deploy production fresh.',
      )
    }
  }
}

function sleepPreview(pr: string, env: Environment, ids: Ids, write: boolean): void {
  const app = readInstance(env.id, ids.appId)
  const postgres = readInstance(env.id, ids.postgresId)
  const appDeployment = deploymentState(app)
  const commit = appDeployment?.commitHash
  const postgresCanWake = commit ? runsWakeRetry(commit) : false
  const state: PreviewState = {
    app: { deployment: appDeployment, sleepApplication: app.sleepApplication === true },
    postgres: {
      deployment: deploymentState(postgres),
      pitrEnabled: postgresCanWake && pitrEnabled(env.name),
      sleepApplication: postgres.sleepApplication === true,
    },
    postgresCanWake,
  }

  const plan = planPreviewSleep(state)
  if ('skip' in plan) {
    console.log(`PR #${pr}: left alone — ${plan.skip}.`)
    return
  }
  if (commit && !postgresCanWake) {
    console.log(
      `PR #${pr}: Postgres stays awake — ${commit.slice(0, 8)} predates the wake retry; merge main.`,
    )
  }
  if (plan.actions.length === 0) {
    console.log(`PR #${pr}: already sleeps when idle.`)
    return
  }
  for (const action of plan.actions) {
    console.log(`PR #${pr}: ${write ? '' : 'would '}${describe(action)}`)
    if (write) apply(action, env, ids)
  }
}

function parseArgs(argv: string[]): { pr: 'all' | string; write: boolean } {
  const write = argv.includes('--apply') || argv.includes('--force')
  if (argv.includes('--all')) return { pr: 'all', write }
  const pr = argv[argv.indexOf('--pr') + 1]
  if (!argv.includes('--pr') || !/^\d+$/.test(pr ?? '')) {
    throw new Error('Usage: preview-sleep.ts (--pr <number> | --all) [--apply]')
  }
  return { pr, write }
}

function main(): void {
  const { pr, write } = parseArgs(process.argv.slice(2))
  const ids = loadIds()
  assertProductionAwake(ids)
  const previews = previewEnvironments(ids)
  const targets = pr === 'all' ? [...previews] : [[pr, previews.get(pr)] as const]
  if (!write) console.log('Dry run — pass --apply to make these changes.\n')

  let failed = 0
  for (const [number, env] of targets) {
    if (!env) {
      console.log(`PR #${number}: no Railway preview environment.`)
      continue
    }
    try {
      sleepPreview(number, env, ids, write)
    } catch (error) {
      failed++
      console.error(`PR #${number}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (write) assertProductionAwake(ids)
  if (failed) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
