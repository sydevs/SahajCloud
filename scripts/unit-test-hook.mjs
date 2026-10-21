import { join } from 'node:path'

import { REPO_ROOT, runForHook, toRepoPath } from './hook-run.mjs'
import { selectSpecs } from './select-unit-specs.mjs'

/** The vitest binary, not `pnpm test:unit`: pnpm's script indirection costs ~0.5 s per edit. */
const vitestArgs = (specs) => [
  'run',
  '--project',
  'unit',
  '--config',
  './vitest.config.mts',
  ...specs,
]

/**
 * The per-edit unit hook, behind `.claude/hooks/unit-test.mjs`: runs only the specs that name the
 * edited file (`select-unit-specs.mjs`), and spawns nothing when none does.
 *
 * @param {{ filePath?: string, projectDir?: string,
 *   spawn?: import('./hook-run.mjs').Spawn, timeoutMs?: number }} hook
 * @returns {string | null}
 */
export function runHook({ filePath, projectDir = REPO_ROOT, spawn, timeoutMs }) {
  const rel = toRepoPath(filePath ?? '', projectDir)
  const specs = selectSpecs(rel, projectDir)
  if (specs.length === 0) return null

  return runForHook({
    command: join(projectDir, 'node_modules/.bin/vitest'),
    args: vitestArgs(specs),
    cwd: projectDir,
    name: 'unit-test hook',
    doing: `running ${specs.length} spec${specs.length === 1 ? '' : 's'} for ${rel}`,
    rerun: `pnpm exec vitest ${vitestArgs(specs).join(' ')}`,
    failure: `Unit tests failed after editing ${rel}`,
    spawn,
    timeoutMs,
  })
}
