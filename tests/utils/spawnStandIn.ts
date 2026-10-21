import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'

/**
 * A `Spawn` for the hook specs that runs `node -e <script>` in place of the real command, with the
 * options the hook passed. The result is node's own `spawnSync` shape, never a hand-built one,
 * because that shape is what the hooks branch on (#993).
 */
export const standIn =
  (script: string) =>
  (_command: string, _args: string[], options: SpawnSyncOptionsWithStringEncoding) =>
    spawnSync(process.execPath, ['-e', script], options)
