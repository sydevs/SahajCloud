/**
 * The decision half of `scripts/preview-sleep.ts`: what to change on one PR
 * preview so it sleeps when idle.
 *
 * Pure — no network — so `tests/unit/preview-sleep-plan.spec.ts` covers it.
 * The CLI half reads Railway and GitHub, and words every line an operator reads.
 */

/** A deployment, reduced to what the plan reads. */
export interface DeploymentState {
  /** The commit an app deployment built. Absent on an image service. */
  commitHash?: string
  /** Whether the settings snapshot it runs has Serverless on. */
  manifestSleeps: boolean
  status: string
}

export interface ServiceState {
  deployment: DeploymentState | null
  /** The service's current setting, which only a new deployment picks up. */
  sleepApplication: boolean
}

export interface PreviewState {
  app: ServiceState
  postgres: ServiceState & { pitrEnabled: boolean }
  /** Whether the commit the app runs retries a connection while Postgres wakes. */
  postgresCanWake: boolean
}

export type SleepAction =
  | { kind: 'deploy'; service: 'app'; commit: string }
  | { kind: 'deploy'; service: 'postgres' }
  | { kind: 'disable-pitr' }
  | { kind: 'set-sleep'; service: 'app' | 'postgres' }

export type SleepPlan = { actions: SleepAction[] } | { skip: string }

/** A deployment serving the preview now. */
export const RUNNING_STATUSES = new Set(['SLEEPING', 'SUCCESS'])

/** The deployment a service can snapshot settings from, or the word its skip line needs. */
function runningDeployment(
  service: ServiceState,
): { deployment: DeploymentState } | { gap: string } {
  if (!service.deployment) return { gap: 'missing' }
  if (!RUNNING_STATUSES.has(service.deployment.status)) return { gap: service.deployment.status }
  return { deployment: service.deployment }
}

/**
 * The changes, in the order to apply them.
 *
 * - **A setting reaches a container only through a new deployment.** Railway
 *   snapshots the settings when it creates one, and "Redeploy" reuses the old
 *   snapshot, so each service whose running deployment lacks Serverless gets a
 *   fresh deploy after its setting changes.
 * - **The app redeploys the commit it already runs**, never the PR's head: a
 *   newer push brings its own deployment, and its own CI run calls this again.
 * - ⚠ **Postgres sleeps only behind an app that retries while it wakes**
 *   (`src/plugins/postgresWake/`). Without the retry, the first request after a
 *   wake fails. Point-in-time recovery uploads every minute and would keep it
 *   awake, so it goes off in the same deployment.
 * - **Postgres goes first.** Its restart takes seconds and the app retries
 *   through it; the app's deploy builds for minutes.
 * - **A service that is not running is left alone, and the preview waits with
 *   it**: one still deploying belongs to a CI run that will call this again, a
 *   failed one has nothing to sleep, and one Railway never deployed here has no
 *   settings snapshot to replace.
 */
export function planPreviewSleep(state: PreviewState): SleepPlan {
  const { app, postgres } = state
  const appRead = runningDeployment(app)
  if ('gap' in appRead) return { skip: `its app deployment is ${appRead.gap}` }
  const commit = appRead.deployment.commitHash
  if (!commit) return { skip: 'its app deployment names no commit' }

  const actions: SleepAction[] = []
  if (state.postgresCanWake) {
    const postgresRead = runningDeployment(postgres)
    if ('gap' in postgresRead) return { skip: `its Postgres deployment is ${postgresRead.gap}` }
    if (!postgres.sleepApplication) actions.push({ kind: 'set-sleep', service: 'postgres' })
    if (postgres.pitrEnabled) actions.push({ kind: 'disable-pitr' })
    if (postgres.pitrEnabled || !postgresRead.deployment.manifestSleeps) {
      actions.push({ kind: 'deploy', service: 'postgres' })
    }
  }
  if (!app.sleepApplication) actions.push({ kind: 'set-sleep', service: 'app' })
  if (!appRead.deployment.manifestSleeps) actions.push({ kind: 'deploy', service: 'app', commit })
  return { actions }
}
