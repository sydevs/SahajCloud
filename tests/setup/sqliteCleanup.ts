import fs from 'fs'

/**
 * Remove a SQLite database file and all standard sidecars.
 * Uses fs.rmSync with `force: true` — no error if any file is missing.
 *
 * Sidecars:
 *   -journal  rollback journal (can survive a crashed prior run)
 *   -wal      write-ahead log
 *   -shm      shared memory
 */
export function removeSqliteFiles(basePath: string): void {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    fs.rmSync(`${basePath}${suffix}`, { force: true })
  }
}
