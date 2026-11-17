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
  /** `pitrEnabled` is `null` where Railway's recovery status did not answer. */
  postgres: ServiceState & { pitrEnabled: boolean | null }
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
 * - **An app that is not running is left alone**: one still deploying belongs
 *   to a CI run that will call this again, and a failed one has nothing to sleep.
 * - **A Postgres with no deployment is left alone too**, and the preview waits
 *   with it: there is no settings snapshot to replace.
 * - ⚠ **A Postgres that is present but not running still gets the deploy**, and
 *   its status is deliberately not read: the fresh deploy is both how the
 *   setting lands and how a failed one recovers, and skipping it would keep the
 *   preview's app billed for the life of the PR.
 * - **An unread recovery status leaves Postgres alone, never the preview.** The
 *   app is the billed service, so it sleeps either way.
 */
export function planPreviewSleep(state: PreviewState): SleepPlan {
  const { app, postgres } = state
  if (!app.deployment || !RUNNING_STATUSES.has(app.deployment.status)) {
    return { skip: `its app deployment is ${app.deployment?.status ?? 'missing'}` }
  }
  const commit = app.deployment.commitHash
  if (!commit) return { skip: 'its app deployment names no commit' }

  const actions: SleepAction[] = []
  if (state.postgresCanWake && postgres.pitrEnabled !== null) {
    if (!postgres.deployment) return { skip: 'its Postgres deployment is missing' }
    if (!postgres.sleepApplication) actions.push({ kind: 'set-sleep', service: 'postgres' })
    if (postgres.pitrEnabled) actions.push({ kind: 'disable-pitr' })
    if (postgres.pitrEnabled || !postgres.deployment.manifestSleeps) {
      actions.push({ kind: 'deploy', service: 'postgres' })
    }
  }
  if (!app.sleepApplication) actions.push({ kind: 'set-sleep', service: 'app' })
  if (!app.deployment.manifestSleeps) actions.push({ kind: 'deploy', service: 'app', commit })
  return { actions }
}
