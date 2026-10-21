import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What both PostToolUse hooks in `.claude/hooks/` share: where the repo is, and how one command's
 * outcome is reported to the session. Their logic lives in `scripts/` because `.claude/` is a
 * protected path, so this half is unit-tested and an unattended run can change it.
 */

/**
 * @typedef {(command: string, args: string[],
 *   options: import('node:child_process').SpawnSyncOptionsWithStringEncoding)
 *   => import('node:child_process').SpawnSyncReturns<string>} Spawn
 */

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TIMEOUT_MS = 30_000

const TAIL_LINES = 30

/** `filePath` relative to `root`, POSIX, or null when it sits outside it. */
export function toRepoPath(filePath, root = REPO_ROOT) {
  const absolute = resolve(root, filePath)
  return absolute.startsWith(root + sep)
    ? absolute
        .slice(root.length + 1)
        .split(sep)
        .join('/')
    : null
}

/**
 * Runs one command for a hook, and returns the context to hand the session, or null when it
 * succeeded.
 *
 * ⚠ **Only a numeric non-zero `status` is a failure.** A timeout leaves `status` null with
 * `error.code` `ETIMEDOUT`; another signal leaves it null with only `signal` set; a binary that
 * never started leaves it null with `error` set and no signal. Reporting any of those as a failure
 * told every session its unit tests broke while they passed (#993).
 *
 * @param {{ command: string, args: string[], cwd: string, name: string, doing: string,
 *   rerun: string, failure: string, spawn?: Spawn, timeoutMs?: number }} run
 * @returns {string | null}
 */
export function runForHook({
  command,
  args,
  cwd,
  name,
  doing,
  rerun,
  failure,
  spawn = spawnSync,
  timeoutMs = TIMEOUT_MS,
}) {
  const result = spawn(command, args, {
    cwd,
    encoding: 'utf-8',
    // The tail is read by a model, not a terminal, so escape codes are noise in it.
    env: { ...process.env, NO_COLOR: '1' },
    timeout: timeoutMs,
  })
  if (result.status === 0) return null

  const program = basename(command)
  const noResult = (what, next = `Run \`${rerun}\` to get one.`) =>
    `The ${name} ${what}, so there is no result. ${next}`

  if (result.error?.code === 'ETIMEDOUT') {
    return noResult(`timed out after ${timeoutMs / 1000} s ${doing}`)
  }
  if (result.signal) {
    return noResult(`saw ${program} killed by ${result.signal} while ${doing}`)
  }
  if (result.error) {
    return noResult(
      `could not start ${program} (${result.error.code ?? result.error.message})`,
      `Install \`node_modules\` if it is missing, then run \`${rerun}\`.`,
    )
  }

  const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .trimEnd()
    .split('\n')
    .slice(-TAIL_LINES)
    .join('\n')

  return `${failure}:\n\n${tail}\n\nRun \`${rerun}\` to see the full output.`
}
