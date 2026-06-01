import type { DocumentReport, ReadinessGroup, ReadinessReport } from './types'

export function isGroupPassing(group: ReadinessGroup): boolean {
  if (group.type === 'aggregate') return group.passed
  if (group.type === 'errored') return false
  return group.documents.every((d) => d.checks.every((c) => c.passed))
}

export function documentsGroup(
  key: string,
  documents: DocumentReport[],
  optional = false,
): ReadinessGroup {
  return {
    type: 'documents',
    key,
    ...(optional ? { optional: true } : {}),
    documents,
    summary: {
      total: documents.length,
      passing: documents.filter((d) => d.checks.every((c) => c.passed)).length,
    },
  }
}

export function aggregateGroup(
  key: string,
  actual: number,
  threshold: number,
  optional = false,
  items?: Array<{ key: string; label: string; passed: boolean }>,
): ReadinessGroup {
  return {
    type: 'aggregate',
    key,
    ...(optional ? { optional: true } : {}),
    passed: actual >= threshold,
    actual,
    threshold,
    ...(items ? { items } : {}),
  }
}

export function erroredGroup(key: string, error: string, optional = false): ReadinessGroup {
  return {
    type: 'errored',
    key,
    ...(optional ? { optional: true } : {}),
    error,
  }
}

/**
 * Compute the required-only `summary` and (if any optional groups exist)
 * the `optionalSummary` rollup for a section.
 */
export function summarize(groups: ReadinessGroup[]): {
  summary: ReadinessReport['summary']
  optionalSummary?: ReadinessReport['optionalSummary']
} {
  const required = groups.filter((g) => !g.optional)
  const optional = groups.filter((g) => !!g.optional)
  const summary = {
    total: required.length,
    passing: required.filter(isGroupPassing).length,
  }
  if (optional.length === 0) return { summary }
  return {
    summary,
    optionalSummary: {
      total: optional.length,
      passing: optional.filter(isGroupPassing).length,
    },
  }
}
