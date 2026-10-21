import { REPO_ROOT, runForHook, toRepoPath } from './hook-run.mjs'

/**
 * Where the Payload schema is declared. Lexical page-block configs live in
 * `src/lib/richEditor/blocks/`, not `src/blocks/`.
 */
const SCHEMA_SOURCE =
  /^src\/(collections|fields|globals|lib\/richEditor\/blocks)\/|^src\/payload\.config\.ts$/

/**
 * The types hook, behind `.claude/hooks/payload-types-gen.mjs`: regenerates `src/payload-types.ts`
 * after an edit to a schema source, and does nothing for any other file.
 *
 * @param {{ filePath?: string, projectDir?: string,
 *   spawn?: import('./hook-run.mjs').Spawn, timeoutMs?: number }} hook
 * @returns {string | null}
 */
export function runTypesHook({ filePath, projectDir = REPO_ROOT, spawn, timeoutMs }) {
  const rel = toRepoPath(filePath ?? '', projectDir)
  if (rel === null || !SCHEMA_SOURCE.test(rel)) return null

  return runForHook({
    command: 'pnpm',
    args: ['generate:types'],
    cwd: projectDir,
    name: 'Payload types hook',
    doing: `regenerating types after editing ${rel}`,
    rerun: 'pnpm generate:types',
    failure: `Failed to regenerate Payload types after editing ${rel}`,
    spawn,
    timeoutMs,
  })
}
