import type { SecretFieldMarker, SecretStaged, SecretStatus } from './types'
import type { CollectionSlug, Endpoint, FlattenedField, PayloadRequest } from 'payload'

import { z } from 'zod'

import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'

import { stagerOf, stageSecret } from './staging'

const stageBody = z.object({
  value: z.string().trim().min(1),
  // ⚠ `nullish`: the admin form holds an empty field as `null`.
  siblings: z.record(z.string(), z.unknown()).nullish(),
})

type Record_ = Record<string, unknown>
const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

interface Resolved {
  doc: Record_
  /** The stored field's dotted path. */
  path: string
  marker: SecretFieldMarker
  /** The stored field's siblings on `doc`, as the caller may read them. */
  siblings: Record_
}

/**
 * The secret this caller may write, or a `Response` refusing them.
 *
 * ⚠ **`overrideAccess: false`, with the caller's own `req`** — `requireActiveManager`
 * admits any active manager with no document check, so the row's own read
 * access is what decides who reaches it at all.
 *
 * ⚠ **Every write lock on the way down, not the factory's option alone.** A
 * collection can stamp more onto a field than it declared — `Clients`' `lockTabs`
 * ANDs the Atlas tab's rule onto every field it holds — and Save would silently
 * strip what a lock refuses. So this reads the sanitized fields' own `update`
 * rules, the parents' included, and the control's too: a door that asked less
 * than Save does would stage a value no Save could apply.
 */
async function resolve(
  req: PayloadRequest,
  slug: CollectionSlug,
): Promise<{ resolved: Resolved } | { response: Response }> {
  const denied = requireActiveManager(req)
  if (denied) return { response: denied }

  const id = req.routeParams?.id
  const path = typeof req.routeParams?.path === 'string' ? req.routeParams.path : ''
  const segments = path.split('.')
  if (id == null || path === '' || segments.some((segment) => segment === '')) {
    return { response: errorResponse('Not found.', 404) }
  }

  let doc: Record_
  try {
    doc = (await req.payload.findByID({
      collection: slug,
      depth: 0,
      id: String(id),
      overrideAccess: false,
      req,
    })) as unknown as Record_
  } catch {
    return { response: errorResponse('Not found.', 404) }
  }

  // Walk the sanitized fields down the path, evaluating each write lock.
  let fields: FlattenedField[] = req.payload.collections[slug].config.flattenedFields
  let siblings: Record_ = doc
  const forbidden = { response: errorResponse('You are not allowed to perform this action.', 403) }
  for (const [index, segment] of segments.entries()) {
    const field = fields.find((entry) => entry.name === segment)
    if (!field) return { response: errorResponse('Not found.', 404) }
    const isLast = index === segments.length - 1
    const lockArgs = { data: doc, doc, id: doc.id as number | string, req, siblingData: siblings }

    if (isLast) {
      const marker = (field.custom as { secret?: SecretFieldMarker } | undefined)?.secret
      if (!marker) return { response: errorResponse('Not found.', 404) }
      const control = fields.find((entry) => entry.name === `${segment}Change`)
      for (const candidate of [field, control]) {
        const update = candidate?.access?.update
        if (update && !(await update(lockArgs))) return forbidden
      }
      return { resolved: { doc, marker, path, siblings } }
    }

    const update = field.access?.update
    if (update && !(await update(lockArgs))) return forbidden
    if (!('flattenedFields' in field)) return { response: errorResponse('Not found.', 404) }
    fields = field.flattenedFields
    siblings = isRecord(siblings[segment]) ? (siblings[segment] as Record_) : {}
  }
  return { response: errorResponse('Not found.', 404) }
}

/** The stored plaintext at `path`, read past the field's own `read: () => false`. */
async function readStored(
  req: PayloadRequest,
  slug: CollectionSlug,
  id: unknown,
  path: string,
): Promise<string | null> {
  const select = path
    .split('.')
    .reduceRight<Record_ | true>((inner, segment) => ({ [segment]: inner }), true) as Record_
  // `overrideAccess: true` runs the decrypting `afterRead`, which an
  // access-checked read never reaches — the field's `read` lock closes it.
  const row = (await req.payload.findByID({
    collection: slug,
    depth: 0,
    id: String(id),
    overrideAccess: true,
    select,
  } as Parameters<typeof req.payload.findByID>[0])) as unknown as Record_
  const value = path
    .split('.')
    .reduce<unknown>((node, segment) => (isRecord(node) ? node[segment] : undefined), row)
  return typeof value === 'string' && value !== '' ? value : null
}

const noStore = { headers: { 'Cache-Control': 'no-store' } }

/**
 * The two routes every collection holding a `secretField` declares: the status
 * the control shows, and the stage its set modal posts. Removal needs no route —
 * it is an instruction the form's own Save carries.
 *
 * Admin-panel only, so they skip the API-client guard: `requireActiveManager`
 * admits `managers` callers alone.
 */
export function secretFieldEndpoints(slug: CollectionSlug): Endpoint[] {
  return [
    {
      method: 'get',
      path: '/:id/secrets/:path',
      handler: async (req) => {
        const gate = await resolve(req, slug)
        if ('response' in gate) return gate.response
        const { doc, path } = gate.resolved

        const stored = await readStored(req, slug, doc.id, path)
        const body: SecretStatus = stored
          ? { last4: stored.slice(-4), set: true }
          : { last4: null, set: false }
        return Response.json(body, noStore)
      },
    },
    {
      method: 'post',
      path: '/:id/secrets/:path',
      handler: async (req) => {
        const gate = await resolve(req, slug)
        if ('response' in gate) return gate.response
        const { doc, marker, path, siblings } = gate.resolved

        const parsed = await parseBody(req, stageBody)
        if (!parsed.ok) return parsed.response
        const { value } = parsed.data

        if (marker.verify) {
          // Only the named siblings are taken from the form, and only to check
          // the value: staging stores nothing but the value itself.
          const posted = parsed.data.siblings ?? {}
          const unsaved = Object.fromEntries(
            marker.dependsOn.filter((key) => key in posted).map((key) => [key, posted[key]]),
          )
          const refusal = await marker.verify({
            req,
            siblingData: { ...siblings, ...unsaved },
            value,
          })
          if (refusal) return errorResponse(refusal, 400)
        }

        const user = stagerOf(req.user)
        if (!user) return errorResponse('You are not allowed to perform this action.', 403)
        const token = await stageSecret(req.payload, {
          collection: slug,
          id: String(doc.id),
          path,
          user,
          value,
        })
        const body: SecretStaged = { last4: value.slice(-4), token }
        return Response.json(body, noStore)
      },
    },
  ]
}
