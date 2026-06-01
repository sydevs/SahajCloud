/**
 * Returns a stable per-run identifier used to prefix every test-created
 * record. Smoke runs share the preview D1, so concurrent PRs (each with
 * their own SMOKE_RUN_ID) won't collide on record names like
 * "smoke-pr-123-456-meditation".
 *
 * CI sets SMOKE_RUN_ID to `pr-<number>-<run_id>`; locally falls back to
 * the process pid so a developer running smoke twice in a row doesn't
 * stomp their own previous records.
 */
export function runId(): string {
  return process.env.SMOKE_RUN_ID ?? `local-${process.pid}`
}
