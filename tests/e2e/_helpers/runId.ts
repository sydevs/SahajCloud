/**
 * Returns a stable per-run identifier used to prefix every test-created
 * record. A preview database is per-PR, but successive runs on that PR —
 * and Playwright's own retries — share it, so the prefix keeps a record a
 * failed run leaked from blocking the next attempt on a unique column like
 * meditations_filename_idx.
 *
 * CI sets SMOKE_RUN_ID to `pr-<number>-<run_id>`. Locally falls back to
 * the process pid so a developer running smoke twice in a row does not
 * stomp their own previous records.
 */
export function runId(): string {
  return process.env.SMOKE_RUN_ID ?? `local-${process.pid}`
}
