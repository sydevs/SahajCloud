import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/**
 * Fails the smoke run when a spec skipped itself against a real preview.
 *
 * A skip is invisible in a green job. Playwright's `github` reporter prints
 * `3 skipped` and emits a `::notice`, but the run still exits 0 — which is how
 * three specs went a long time without asserting anything (#704).
 *
 * The gate is `PREVIEW_URL`. With one set, a deployed environment answered, so
 * there is nothing a spec may legitimately skip for. Without one, the run is
 * either a local pass over `localhost:3000` or a job with no preview, and the
 * two `error-disclosure` specs skip on purpose — `debug` is on by design in a
 * development server, so their assertion would be correct and inapplicable at
 * once. That case is the CI job's `::warning` to report, not this reporter's.
 *
 * Driven directly by `tests/unit/fail-on-skip-reporter.spec.ts`, because the
 * failure mode this guards against is silence.
 */
export default class FailOnSkipReporter implements Reporter {
  private readonly skipped = new Set<TestCase>()

  onTestEnd(test: TestCase, result: TestResult): void {
    // TestCase identity is stable across attempts, so a retry that finally ran
    // clears the entry its skipped attempt added.
    if (result.status === 'skipped') this.skipped.add(test)
    else this.skipped.delete(test)
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    if (this.skipped.size === 0 || !process.env.PREVIEW_URL) return

    const list = [...this.skipped]
      .map((test) => `  - ${test.titlePath().filter(Boolean).join(' › ')}`)
      .join('\n')
    console.error(
      `\n${this.skipped.size} smoke spec(s) skipped while PREVIEW_URL was set:\n${list}\n\n` +
        'A preview answered, so nothing here is skippable. A per-PR preview carries no seeded ' +
        'content by design — each spec builds its own fixtures (tests/e2e/_helpers/fixtures.ts). ' +
        'Failing the run rather than reporting it green.\n',
    )

    // Only promote a pass. A run that already failed, timed out or was
    // interrupted keeps the status that says which.
    if (result.status === 'passed') return { status: 'failed' }
  }
}
