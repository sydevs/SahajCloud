import type { ProjectRequestContext, SectionSpec } from './spec'
import type { ReadinessGroup, ReadinessReport } from './types'

import { aggregateGroup, documentsGroup, summarize } from './groups'

/**
 * Execute one section's spec and return its `ReadinessReport`. Runs
 * `prepare` once, dispatches to each group's `evaluate`, then aggregates.
 *
 * Validates each emitted check `key` against `spec.checks` — drift
 * between an evaluator and the section's metadata throws a typed error
 * naming the offending key. This is the runtime enforcement of the
 * "single definition site per key" invariant.
 */
export async function runSection<TConfig, TSectionCtx>(
  spec: SectionSpec<TConfig, TSectionCtx>,
  req: ProjectRequestContext<TConfig>,
): Promise<ReadinessReport> {
  const sectionCtx = spec.prepare
    ? await spec.prepare(req)
    : (undefined as unknown as TSectionCtx)

  const declaredCheckKeys = new Set(Object.keys(spec.checks))

  const groups: ReadinessGroup[] = await Promise.all(
    spec.groups.map(async (group) => {
      if (group.type === 'aggregate') {
        const actual = await group.evaluate(sectionCtx, req)
        return aggregateGroup(group.key, actual, group.threshold, group.optional ?? false)
      }
      const documents = await group.evaluate(sectionCtx, req)
      for (const doc of documents) {
        for (const check of doc.checks) {
          if (!declaredCheckKeys.has(check.key)) {
            throw new Error(
              `runSection(${spec.key}): group "${group.key}" emitted undeclared check "${check.key}". ` +
                `Add it to the section's \`checks\` map (or fix the typo in the evaluator).`,
            )
          }
        }
      }
      return documentsGroup(group.key, documents, group.optional ?? false)
    }),
  )

  return { groups, ...summarize(groups) }
}
