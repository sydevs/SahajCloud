import { describe, expect, it } from 'vitest'

import { planPreviewSleep, type PreviewState } from '../../scripts/preview-sleep-plan'

/** A preview exactly as Railway creates one: every setting copied from production. */
const freshPreview = (overrides: Partial<PreviewState> = {}): PreviewState => ({
  app: {
    deployment: { commitHash: 'abc123', manifestSleeps: false, status: 'SUCCESS' },
    sleepApplication: false,
  },
  postgres: {
    deployment: { manifestSleeps: false, status: 'SUCCESS' },
    pitrEnabled: true,
    sleepApplication: false,
  },
  postgresCanWake: true,
  ...overrides,
})

describe('planPreviewSleep', () => {
  it('sleeps both services of a fresh preview, Postgres first', () => {
    expect(planPreviewSleep(freshPreview())).toEqual({
      actions: [
        { kind: 'set-sleep', service: 'postgres' },
        { kind: 'disable-pitr' },
        { kind: 'deploy', service: 'postgres' },
        { kind: 'set-sleep', service: 'app' },
        { kind: 'deploy', service: 'app', commit: 'abc123' },
      ],
    })
  })

  // The caller reads recovery whenever it reads the Postgres, so recovery-on
  // with no wake retry is a state it really builds.
  it('leaves Postgres awake behind an app with no wake retry', () => {
    expect(planPreviewSleep(freshPreview({ postgresCanWake: false }))).toEqual({
      actions: [
        { kind: 'set-sleep', service: 'app' },
        { kind: 'deploy', service: 'app', commit: 'abc123' },
      ],
    })
  })

  it('changes nothing once both deployments run with Serverless', () => {
    const state = freshPreview()
    state.app = {
      deployment: { commitHash: 'abc123', manifestSleeps: true, status: 'SLEEPING' },
      sleepApplication: true,
    }
    state.postgres = {
      deployment: { manifestSleeps: true, status: 'SUCCESS' },
      pitrEnabled: false,
      sleepApplication: true,
    }
    expect(planPreviewSleep(state)).toEqual({ actions: [] })
  })

  it('deploys fresh when the setting is on but the running snapshot predates it', () => {
    const state = freshPreview({ postgresCanWake: false })
    state.app.sleepApplication = true
    expect(planPreviewSleep(state)).toEqual({
      actions: [{ kind: 'deploy', service: 'app', commit: 'abc123' }],
    })
  })

  it('redeploys Postgres to take point-in-time recovery off, even if it already sleeps', () => {
    const state = freshPreview()
    state.app.sleepApplication = true
    state.app.deployment!.manifestSleeps = true
    state.postgres.sleepApplication = true
    state.postgres.deployment!.manifestSleeps = true
    expect(planPreviewSleep(state)).toEqual({
      actions: [{ kind: 'disable-pitr' }, { kind: 'deploy', service: 'postgres' }],
    })
  })

  it.each(['BUILDING', 'DEPLOYING', 'FAILED', 'CRASHED'])(
    'leaves a preview whose app is %s alone',
    (status) => {
      const state = freshPreview()
      state.app.deployment!.status = status
      expect(planPreviewSleep(state)).toEqual({ skip: `its app deployment is ${status}` })
    },
  )

  it('leaves a preview with no app deployment alone', () => {
    const state = freshPreview()
    state.app.deployment = null
    expect(planPreviewSleep(state)).toEqual({ skip: 'its app deployment is missing' })
  })

  // ⚠ Pins the asymmetry: a present-but-failed Postgres is deployed, not
  // skipped, or the preview's app would stay billed for the life of the PR.
  it('deploys a Postgres whose deployment failed, rather than skipping the preview', () => {
    const state = freshPreview()
    state.postgres.deployment!.status = 'FAILED'
    expect(planPreviewSleep(state)).toEqual({
      actions: [
        { kind: 'set-sleep', service: 'postgres' },
        { kind: 'disable-pitr' },
        { kind: 'deploy', service: 'postgres' },
        { kind: 'set-sleep', service: 'app' },
        { kind: 'deploy', service: 'app', commit: 'abc123' },
      ],
    })
  })

  it('leaves a preview with no Postgres deployment alone', () => {
    const state = freshPreview()
    state.postgres.deployment = null
    expect(planPreviewSleep(state)).toEqual({ skip: 'its Postgres deployment is missing' })
  })

  // Where the skip sits is what keeps this preview's app sleeping.
  it('sleeps the app of a preview with no Postgres deployment and no wake retry', () => {
    const state = freshPreview({ postgresCanWake: false })
    state.postgres.deployment = null
    expect(planPreviewSleep(state)).toEqual({
      actions: [
        { kind: 'set-sleep', service: 'app' },
        { kind: 'deploy', service: 'app', commit: 'abc123' },
      ],
    })
  })
})
