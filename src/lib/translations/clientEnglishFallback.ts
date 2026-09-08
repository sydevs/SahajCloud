/**
 * Fill blank translation keys from English, for API-client reads only.
 *
 * Payload's locale fallback is **per field, not per key**: a JSON blob that
 * omits `loading` returns a blob without it, not English's value. So a locale
 * with any translation at all renders blanks for everything it has not
 * translated yet, and every consumer repo has to carry the same merge — which
 * is what `resolveEmailStrings` already does for one group.
 *
 * Doing it here instead means a consumer reads a complete set or nothing.
 *
 * **Scoped to `req.user.collection === 'clients'`** on purpose. A manager
 * editing the global must keep seeing which keys are empty — merging English in
 * would make the admin claim every key is translated, and the status report
 * would agree. The same guard keeps the admin's own English-reference fetch
 * (`useEnglishTranslation`) honest.
 */

import type { LeafLookup, SchemaNode } from './schemaWalker'
import type { GlobalAfterReadHook, PayloadRequest } from 'payload'

import { isValidLocale, DEFAULT_LOCALE } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'


import { collectLeafLookups, extractPlainText, isObjectNode } from './schemaWalker'

type WalkableSchema = { properties?: Record<string, SchemaNode> }

type Doc = Record<string, unknown>

function isRecord(value: unknown): value is Doc {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every leaf key a locale is expected to hold, plural families expanded. */
export function schemaLookups(schema: WalkableSchema): LeafLookup[] {
  return Object.entries(schema.properties ?? {})
    .filter(([slug, node]) => slug.trim().length > 0 && isObjectNode(node))
    .flatMap(([slug, node]) => collectLeafLookups(slug, node, { expandPlurals: true }))
}

function container(doc: Doc, groupField: string | null): Doc | null {
  if (groupField === null) return doc
  const group = doc[groupField]
  return isRecord(group) ? group : null
}

/**
 * The container to write into, cloned on first use.
 *
 * `{ ...doc }` is one level deep, so a nested group's object is shared with the
 * input document — writing into it would mutate the caller's document, which
 * this merge promises not to do. Cloning lazily leaves a document with no gaps
 * untouched.
 */
function writableContainer(merged: Doc, groupField: string | null, cloned: Set<string>): Doc | null {
  if (groupField === null) return merged
  if (!cloned.has(groupField)) {
    const group = merged[groupField]
    if (!isRecord(group)) return null
    merged[groupField] = { ...group }
    cloned.add(groupField)
  }
  return merged[groupField] as Doc
}

/**
 * Copy English into every blank or missing key of `doc`, in place on a shallow
 * clone. Pure — no request, no database, no locale logic.
 *
 * **A key absent from the document is only filled when its own field is
 * present.** A `select`-stripped field is missing from `doc` entirely, and
 * re-adding it would hand a caller a field it explicitly asked not to receive.
 * Inside a field that *is* present, a missing key is a gap and is filled.
 */
export function mergeEnglish(doc: Doc, english: Doc, lookups: LeafLookup[]): Doc {
  const merged: Doc = { ...doc }
  const cloned = new Set<string>()

  for (const lookup of lookups) {
    const source = container(english, lookup.groupField)
    if (!source) continue
    const target = writableContainer(merged, lookup.groupField, cloned)
    if (!target) continue
    if (!Object.hasOwn(target, lookup.fieldName)) continue

    // A richText key is its own column: fill the whole value when it is null
    // or renders no text.
    if (lookup.innerKey === null) {
      const current = target[lookup.fieldName]
      if (current != null && extractPlainText(current).trim().length > 0) continue
      const replacement = source[lookup.fieldName]
      if (replacement == null) continue
      target[lookup.fieldName] = replacement
      continue
    }

    // A string key lives inside its leaf group's JSON blob.
    const currentBlob = target[lookup.fieldName]
    const sourceBlob = source[lookup.fieldName]
    if (!isRecord(sourceBlob)) continue
    const replacement = sourceBlob[lookup.innerKey]
    if (typeof replacement !== 'string' || replacement.trim().length === 0) continue

    const blob = isRecord(currentBlob) ? { ...currentBlob } : {}
    const current = blob[lookup.innerKey]
    if (typeof current === 'string' && current.trim().length > 0) continue
    blob[lookup.innerKey] = replacement
    target[lookup.fieldName] = blob
  }

  return merged
}

/** `req.context` key for the per-request English read, one per global slug. */
function memoKey(slug: string): string {
  return `translations:english:${slug}`
}

function shouldMerge(req: PayloadRequest | undefined): req is PayloadRequest {
  if (!req) return false
  if (req.user?.collection !== 'clients') return false
  const locale = req.locale
  if (typeof locale !== 'string') return false
  return locale !== DEFAULT_LOCALE && isValidLocale(locale)
}

/**
 * The hook itself. Never throws: a failed English read logs at debug and
 * returns the document untouched, because a partially translated page is a
 * better outcome than a 500 on every consumer read.
 */
export function clientEnglishFallback(schema: WalkableSchema): GlobalAfterReadHook {
  const lookups = schemaLookups(schema)

  return async ({ doc, global, req }) => {
    if (!isRecord(doc)) return doc
    if (!shouldMerge(req)) return doc

    try {
      const english = await memoizeOnRequest(req, memoKey(global.slug), () =>
        req.payload.findGlobal({
          slug: global.slug as Parameters<typeof req.payload.findGlobal>[0]['slug'],
          locale: DEFAULT_LOCALE,
          fallbackLocale: false,
          depth: 0,
          draft: false,
          overrideAccess: true,
          // The nested read's locale is `en`, so this hook is a no-op inside
          // it — and the copy keeps that locale off the caller's request.
          req: localeIsolatedReq(req),
        }),
      )
      if (!isRecord(english)) return doc
      return mergeEnglish(doc, english, lookups)
    } catch (error) {
      req.payload.logger.debug(
        { err: error, global: global.slug, locale: req.locale },
        'English translation fallback skipped',
      )
      return doc
    }
  }
}
