import { NextResponse } from 'next/server'

import { fixtureEnabled, fixtureStatus, type FixtureStatus } from '@/fixture/gate'
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

/**
 * Where the preview fixture's load stands (`src/fixture/AGENTS.md`).
 *
 * Payload boots on first use, and the load starts from its `onInit`, so a
 * health check finding no load yet boots Payload itself — this route is what
 * Railway and CI poll after every deploy. Production never imports the config
 * here.
 */
async function fixtureHealth(): Promise<FixtureStatus> {
  if (!fixtureEnabled()) return 'off'
  const status = fixtureStatus()
  if (status) return status
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  void getPayload({ config }).catch(() => {})
  return 'loading'
}

export async function GET() {
  try {
    // Basic health check - ensure the application is running
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // The deployment name, not NODE_ENV (#733). Nothing reads this field
      // today, so this is a consistency fix, not a behaviour one.
      environment: deploymentEnvironment(),
      version: process.env.npm_package_version || 'unknown',
      // ⚠ **The only field that says WHICH commit is serving.** `version` is
      // identical on every commit, so CI could confirm a preview was up and
      // never that it had caught up with the push — it then filled and tested
      // the deploy before. Railway injects this; `unknown` means it stopped,
      // and `scripts/get-railway-preview-url.ts` fails rather than testing an
      // unknown build. ⚠ **Keep it unconditional.** An absent key is a signal
      // in its own right: discovery reads it as a build older than this field
      // and tells the reader to merge the base (#1124), so omitting it on any
      // path would send them there for nothing.
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',
      // CI waits for `loaded` on the head commit, and fails on `failed`. Only
      // the word: the error is in the deploy log.
      fixture: await fixtureHealth(),
    }

    return NextResponse.json(health, { status: 200 })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Health Route] Health check failed:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 500 },
    )
  }
}
