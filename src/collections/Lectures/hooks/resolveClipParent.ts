import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

/**
 * Resolve a clip's parent full lecture before NV fetch runs.
 *
 * For clip creates only: validates that exactly one of `nirmalVidyaVimeoUrl` or
 * `fullLecture` is supplied (both is fine — `fullLecture` wins), looks up an
 * existing full lecture by URL or creates one on the fly, and nulls out the
 * URL on the clip record (it was a creation-time lookup key only).
 *
 * Must run BEFORE `populateFromNirmalaVidya`, which then no-ops because
 * `data.type === 'clip'`.
 */
export const resolveClipParent: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (data.type !== 'clip') return data

  const url = typeof data.nirmalVidyaVimeoUrl === 'string' ? data.nirmalVidyaVimeoUrl : ''
  const hasUrl = url.length > 0
  const hasParent = data.fullLecture !== undefined && data.fullLecture !== null

  if (!hasUrl && !hasParent) {
    throw new ValidationError({
      errors: [
        {
          message:
            'A clip must reference a full lecture: provide either a Vimeo URL or pick an existing full lecture.',
          path: 'fullLecture',
        },
      ],
    })
  }

  // If both supplied, fullLecture wins — null out the URL.
  if (hasParent) {
    data.nirmalVidyaVimeoUrl = null
    return data
  }

  // hasUrl only: lookup-or-create the parent full lecture by URL.
  const existing = await req.payload.find({
    collection: 'lectures',
    where: {
      and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: url } }],
    },
    limit: 1,
    depth: 0,
    req,
  })

  let parentId: number
  if (existing.docs.length > 0) {
    parentId = existing.docs[0].id as number
  } else {
    try {
      const created = await req.payload.create({
        collection: 'lectures',
        data: { type: 'full', nirmalVidyaVimeoUrl: url },
        req,
      })
      parentId = created.id as number
    } catch (err) {
      // A concurrent clip create may have raced us to creating the parent;
      // populateFromNirmalaVidya rejects the duplicate. Re-find and reuse.
      const refind = await req.payload.find({
        collection: 'lectures',
        where: {
          and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: url } }],
        },
        limit: 1,
        depth: 0,
        req,
      })
      if (refind.docs.length === 0) throw err
      parentId = refind.docs[0].id as number
    }
  }

  data.fullLecture = parentId
  data.nirmalVidyaVimeoUrl = null
  return data
}
