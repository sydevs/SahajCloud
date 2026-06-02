import type { CheckResult, DocumentReport, ReadinessGroup, ReadinessReport } from './types'

/** Baked onto every group by its constructor — exposed for external callers/tests. */
export function isGroupPassing(group: ReadinessGroup): boolean {
  return group.passing
}

export function documentsGroup(
  key: string,
  documents: DocumentReport[],
  optional = false,
): ReadinessGroup {
  const passing = documents.filter((d) => d.checks.every((c) => c.passed)).length
  const total = documents.length
  return {
    type: 'documents',
    key,
    ...(optional ? { optional: true } : {}),
    documents,
    summary: { total, passing },
    // Zero documents has nothing to pass — treat as failing.
    passing: total > 0 && passing === total,
    counter: { current: passing, total },
  }
}

export function aggregateGroup(
  key: string,
  actual: number,
  threshold: number,
  optional = false,
  items?: Array<{ id: string | number; label: string; checks: CheckResult[] }>,
): ReadinessGroup {
  return {
    type: 'aggregate',
    key,
    ...(optional ? { optional: true } : {}),
    passed: actual >= threshold,
    actual,
    threshold,
    ...(items ? { items } : {}),
    passing: actual >= threshold,
    counter: { current: Math.min(actual, threshold), total: threshold },
  }
}

export function erroredGroup(key: string, error: string, optional = false): ReadinessGroup {
  return {
    type: 'errored',
    key,
    ...(optional ? { optional: true } : {}),
    error,
    passing: false,
    counter: null,
  }
}

/**
 * Build the section-level rollup: the required-only `summary`, the optional
 * `optionalSummary` (when any optional groups exist), the baked `passing`
 * fact (all required groups pass), and the document-level `progress` metric
 * (sum of every group's counter, including optional).
 */
export function summarize(groups: ReadinessGroup[]): {
  summary: ReadinessReport['summary']
  optionalSummary?: ReadinessReport['optionalSummary']
  passing: ReadinessReport['passing']
  progress: ReadinessReport['progress']
} {
  const required = groups.filter((g) => !g.optional)
  const optional = groups.filter((g) => !!g.optional)
  const summary = {
    total: required.length,
    passing: required.filter(isGroupPassing).length,
  }
  // Document-level progress sums every group's counter (incl. optional);
  // errored groups have no counter and contribute nothing.
  const progress = { passing: 0, total: 0 }
  for (const g of groups) {
    if (g.counter) {
      progress.passing += g.counter.current
      progress.total += g.counter.total
    }
  }
  const passing = summary.total > 0 && summary.passing === summary.total
  if (optional.length === 0) return { summary, passing, progress }
  return {
    summary,
    optionalSummary: {
      total: optional.length,
      passing: optional.filter(isGroupPassing).length,
    },
    passing,
    progress,
  }
}
