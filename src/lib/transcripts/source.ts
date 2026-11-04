import type { CollectionSlug, Where } from 'payload'

/**
 * The `where` that finds the transcript of one source.
 *
 * ⚠ **This is the only spelling Payload resolves, and the wrong ones fail at
 * run time rather than at build time.** `transcripts.source` is polymorphic, so
 * `Where`'s loose typing accepts two spellings that compile and then misbehave:
 * a bare `source` throws `APIError('Not supported')` when the query is built,
 * and `source.value` ORs one raw id column per target, matching meditation 5
 * **or** file 5. One builder is what keeps every call site — and
 * `cascadeDeletion`'s hook — on the one shape.
 *
 * Here rather than in `@/lib/meditations/transcript`, which builds zod schemas
 * at module scope: the Transcript tab is a `'use client'` module and calls this,
 * so reaching it through that one would ship zod to the browser to describe a
 * shape only the server validates. Same split as that folder's
 * `transcriptBounds`.
 */
export const transcriptSourceWhere = (
  relationTo: Extract<CollectionSlug, 'meditations' | 'files'>,
  value: number | string,
): Where => ({ source: { equals: { relationTo, value } } })
