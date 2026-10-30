/**
 * A job failure that is an answer, not an incident: throw it in place of an
 * `Error`, and the job capture reports it at `warning`. An outage stays an
 * `Error`. The convention: `src/AGENTS.md`, jobs section.
 */
export class ExpectedJobFailure extends Error {
  override name = 'ExpectedJobFailure'
}
