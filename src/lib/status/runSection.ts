import type { ProjectRequestContext, SectionSpec } from './spec'
import type { ReadinessGroup } from './types'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { ReadinessReport } from '@/payload-types'

import { aggregateGroup, documentsGroup, erroredGroup, summarize } from './groups'

/**
 * Thrown when a `documents` group emits a check key that isn't declared
 * in the parent section's `checks` map. Programming error — never caught
 * by the runtime; surfaces loudly so typos in evaluators don't silently
 * degrade the report.
 */
export class UndeclaredCheckKeyError extends Error {
  readonly sectionKey: string
  readonly groupKey: string
  readonly checkKey: string

  constructor(sectionKey: string, groupKey: string, checkKey: string) {
    super(
      `runSection(${sectionKey}): group "${groupKey}" emitted undeclared check "${checkKey}". ` +
        `Add it to the section's \`checks\` map (or fix the typo in the evaluator).`,
    )
    this.name = 'UndeclaredCheckKeyError'
    this.sectionKey = sectionKey
    this.groupKey = groupKey
    this.checkKey = checkKey
  }
}

/**
 * Execute one section's spec and return its `ReadinessReport`. Runs
 * `prepare` once, dispatches to each group's `evaluate`, then aggregates.
 *
 * Group evaluators run via `Promise.allSettled` so a single failure
 * degrades to an `errored` placeholder group instead of sinking the
 * whole section. Programming errors (undeclared check keys) still throw
 * loudly — we don't want typos hiding behind the graceful-degradation
 * path.
 *
 * Each section gets its own copy of the caller's request. One status
 * global is several virtual fields, and Payload awaits every field's
 * `afterRead` in one `Promise.all`, so the sections run concurrently on
 * one request — while `createLocalReq` assigns `locale` and
 * `fallbackLocale` onto whatever request it is handed. Sharing it lets
 * one section's read decide what another resolves (#982). A section's own
 * reads still copy again wherever they differ from each other.
 */
export async function runSection<TConfig, TSectionCtx>(
  spec: SectionSpec<TConfig, TSectionCtx>,
  incoming: ProjectRequestContext<TConfig>,
): Promise<ReadinessReport> {
  const req: ProjectRequestContext<TConfig> = incoming.req
    ? { ...incoming, req: localeIsolatedReq(incoming.req) }
    : incoming
  const sectionCtx = spec.prepare ? await spec.prepare(req) : (undefined as unknown as TSectionCtx)

  const declaredCheckKeys = new Set(Object.keys(spec.checks))

  const settled = await Promise.allSettled(
    spec.groups.map(async (group) => {
      if (group.type === 'aggregate') {
        const result = await group.evaluate(sectionCtx, req)
        let actual = result.actual ?? 0
        if (result.items) {
          for (const item of result.items) {
            for (const check of item.checks) {
              if (!declaredCheckKeys.has(check.key)) {
                throw new UndeclaredCheckKeyError(spec.key, group.key, check.key)
              }
            }
          }
          actual = result.items.filter((i) => i.checks.every((c) => c.passed)).length
        }
        return aggregateGroup(
          group.key,
          actual,
          group.threshold,
          group.optional ?? false,
          result.items,
        )
      }
      const documents = await group.evaluate(sectionCtx, req)
      for (const doc of documents) {
        for (const check of doc.checks) {
          if (!declaredCheckKeys.has(check.key)) {
            throw new UndeclaredCheckKeyError(spec.key, group.key, check.key)
          }
        }
      }
      return documentsGroup(group.key, documents, group.optional ?? false)
    }),
  )

  const groups: ReadinessGroup[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    if (result.reason instanceof UndeclaredCheckKeyError) throw result.reason
    const groupSpec = spec.groups[i]
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
    req.payload.logger.error({
      msg: 'runSection: group evaluator threw — returning errored placeholder',
      section: spec.key,
      group: groupSpec.key,
      error: message,
    })
    return erroredGroup(groupSpec.key, message, groupSpec.optional ?? false)
  })

  return { groups, ...summarize(groups) }
}
