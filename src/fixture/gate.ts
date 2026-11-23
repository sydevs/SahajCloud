import type { Payload } from 'payload'

import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

/**
 * What `/api/health` says about the load. `off` where the loader never runs;
 * `loading` until it ends, which includes the moment before Payload has booted.
 */
export type FixtureStatus = 'failed' | 'loaded' | 'loading' | 'off'

export interface FixtureGateInput {
  isProduction: boolean
  /** `process.env.NEXT_RUNTIME`: set inside the Next server, and nowhere else. */
  nextRuntime: string | undefined
  nextPhase: string | undefined
  nodeEnv: string | undefined
  e2e: boolean
}

/**
 * Whether this process loads the fixture.
 *
 * - **Never production.** Read from Railway's environment name, never
 *   `NODE_ENV`: previews run `NODE_ENV=production`.
 * - **Only inside the Next server.** A script, a seed run or a test boots
 *   Payload too, and a script can point at any database — the break-glass
 *   scripts take production's `DATABASE_URL` off-Railway, where nothing else
 *   would tell it apart from a laptop.
 * - **Never the build, or a test lane.**
 */
export function fixtureGate(input: FixtureGateInput): boolean {
  return (
    !input.isProduction &&
    input.nextRuntime === 'nodejs' &&
    input.nextPhase !== 'phase-production-build' &&
    input.nodeEnv !== 'test' &&
    !input.e2e
  )
}

export const fixtureEnabled = (): boolean =>
  fixtureGate({
    isProduction: isProductionDeployment(),
    nextRuntime: process.env.NEXT_RUNTIME,
    nextPhase: process.env.NEXT_PHASE,
    nodeEnv: process.env.NODE_ENV,
    e2e: process.env.E2E_TEST === 'true',
  })

/**
 * On `globalThis`, because the health route and `onInit` can sit in different
 * server bundles that each hold their own copy of this module.
 */
const state = globalThis as { __sahajFixture?: { status: FixtureStatus } }

export const fixtureStatus = (): FixtureStatus | undefined => state.__sahajFixture?.status

export const setFixtureStatus = (status: FixtureStatus): void => {
  state.__sahajFixture = { status }
}

/**
 * Start the load in the background and record how it ends. Called from
 * `onInit`, never awaited: the health check answers while it runs. The loader
 * and the fixture's data are imported here, on a server that loads them, so the
 * config's own import graph never carries them.
 */
export function startFixtureLoad(payload: Payload): void {
  if (!fixtureEnabled() || fixtureStatus()) return
  setFixtureStatus('loading')
  const started = Date.now()

  void import('./load')
    .then(({ loadFixture }) => loadFixture(payload))
    .then((report) => {
      for (const { slug, id, error } of report.errors) {
        const what = id == null ? slug : `${slug} ${id}`
        payload.logger.error({ err: error }, `[fixture] ${what} failed to load`)
      }
      setFixtureStatus(report.errors.length ? 'failed' : 'loaded')
      payload.logger.info(
        `[fixture] ${report.errors.length ? 'FAILED' : 'loaded'} in ${Date.now() - started} ms: ` +
          `${report.created} created, ${report.updated} updated, ${report.deleted} deleted, ` +
          `${report.unchanged} unchanged, ${report.errors.length} failed`,
      )
    })
    .catch((error: unknown) => {
      payload.logger.error({ err: error }, '[fixture] the load stopped')
      setFixtureStatus('failed')
    })
}
