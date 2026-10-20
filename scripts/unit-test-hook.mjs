import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { REPO_ROOT, selectSpecs, toRepoPath } from './select-unit-specs.mjs'

/**
 * The per-edit unit hook's logic, behind the thin `.claude/hooks/unit-test.mjs`. It lives here
 * because `.claude/` is a protected path: this half stays unit-tested
 * (`tests/unit/unit-test-hook.spec.ts`), and an unattended run can change it.
 */

/**
 * @typedef {(command: string, args: string[],
 *   options: import('node:child_process').SpawnSyncOptionsWithStringEncoding)
 *   => import('node:child_process').SpawnSyncReturns<string>} Spawn
 */

const TIMEOUT_MS = 30_000

const TAIL_LINES = 30

/** The vitest binary, not `pnpm test:unit`: pnpm's script indirection costs ~0.5 s per edit. */
const vitestArgs = (specs) => [
  'run',
  '--project',
  'unit',
  '--config',
  './vitest.config.mts',
  ...specs,
]

const rerun = (specs) => `pnpm exec vitest ${vitestArgs(specs).join(' ')}`

/**
 * The message for one finished `spawnSync`, or null when the specs passed.
 *
 * ⚠ **Only a numeric non-zero `status` is a test failure.** A timeout leaves `status` null with
 * `error.code` `ETIMEDOUT`; another signal leaves it null with only `signal` set; a binary that
 * never started leaves it null with `error` set and no signal. Reporting any of those as "tests
 * failed" is the false failure this module exists to stop (#993).
 */
function describeRun(result, { rel, specs, timeoutMs }) {
  if (result.status === 0) return null

  const notATestResult = (what, next = `Run \`${rerun(specs)}\` to see whether they pass.`) =>
    `The unit-test hook ${what}. This is not a test result. ${next}`
  const running = `${specs.length} spec${specs.length === 1 ? '' : 's'} for ${rel}`

  if (result.error?.code === 'ETIMEDOUT') {
    return notATestResult(`timed out after ${timeoutMs / 1000} s running ${running}`)
  }
  if (result.signal) {
    return notATestResult(`saw vitest killed by ${result.signal} while running ${running}`)
  }
  if (result.error) {
    return notATestResult(
      `could not start vitest for ${rel} (${result.error.code ?? result.error.message})`,
      `Install \`node_modules\` if it is missing, then run \`${rerun(specs)}\`.`,
    )
  }

  const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .trimEnd()
    .split('\n')
    .slice(-TAIL_LINES)
    .join('\n')

  return `Unit tests failed after editing ${rel}:\n\n${tail}\n\nRun \`${rerun(specs)}\` to see the full output.`
}

/**
 * One hook invocation, for the file an Edit or Write touched.
 *
 * @param {{ filePath?: string, projectDir?: string, spawn?: Spawn, timeoutMs?: number }} hook
 * @returns {string | null}
 */
export function runHook({
  filePath,
  projectDir = REPO_ROOT,
  spawn = spawnSync,
  timeoutMs = TIMEOUT_MS,
}) {
  const rel = toRepoPath(filePath ?? '', projectDir)
  const specs = selectSpecs(rel, projectDir)
  if (specs.length === 0) return null

  const result = spawn(join(projectDir, 'node_modules/.bin/vitest'), vitestArgs(specs), {
    cwd: projectDir,
    encoding: 'utf-8',
    // The tail is read by a model, not a terminal, so escape codes are noise in it.
    env: { ...process.env, NO_COLOR: '1' },
    timeout: timeoutMs,
  })

  return describeRun(result, { rel, specs, timeoutMs })
}
