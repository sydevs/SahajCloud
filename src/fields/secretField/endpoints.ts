import type { SecretFieldMarker, SecretStaged, SecretStatus } from './types'
import type { CollectionSlug, Endpoint, FlattenedField, PayloadRequest } from 'payload'

import { combineQueries, executeAccess } from 'payload'
import { getObjectDotNotation } from 'payload/shared'
import { z } from 'zod'

import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'
import { isRecord } from '@/lib/utilities/isRecord'

import { stagerOf, stageSecret } from './staging'

import { changeFieldName } from './index'

const stageBody = z.object({
  value: z.string().trim().min(1),
  // ⚠ `nullish`: the admin form holds an empty field as `null`.
  siblings: z.record(z.string(), z.unknown()).nullish(),
})

type Row = Record<string, unknown>

interface Resolved {
  id: number | string
  /** The stored field's dotted path. */
  path: string
  marker: SecretFieldMarker
  /** The stored field's siblings on the row, as the caller may read them. */
  siblings: Row
}

const notFound = () => ({ response: errorResponse('Not found.', 404) })
const forbidden = () => ({
  response: errorResponse('You are not allowed to perform this action.', 403),
})

/**
 * The secret this caller may write, or a `Response` refusing them.
 *
 * ⚠ **`overrideAccess: false`, with the caller's own `req`** — `requireActiveManager`
 * admits any active manager with no document check, so the row's own read
 * access is what decides who reaches it at all.
 *
 * ⚠ **Everything Save would ask, not the factory's option alone**: the row's own
 * `update`, then every write lock on the way down — the parents' and the
 * control's included. A collection can stamp more onto a field than it declared
 * (`Clients`' `lockTabs`), and Save silently strips what a lock refuses, so a door
 * asking less would stage a value no Save could apply.
 */
async function resolve(
  req: PayloadRequest,
  slug: CollectionSlug,
): Promise<{ resolved: Resolved } | { response: Response }> {
  const denied = requireActiveManager(req)
  if (denied) return { response: denied }

  const routeId = req.routeParams?.id
  const path = typeof req.routeParams?.path === 'string' ? req.routeParams.path : ''
  const segments = path.split('.')
  if (routeId == null || segments.some((segment) => segment === '')) return notFound()

  let doc: Row
  try {
    doc = (await req.payload.findByID({
      collection: slug,
      depth: 0,
      id: String(routeId),
      overrideAccess: false,
      req,
    })) as unknown as Row
  } catch {
    return notFound()
  }
  const id = doc.id as number | string

  const { config } = req.payload.collections[slug]
  const rowUpdate = await executeAccess(
    { data: doc, disableErrors: true, id, req },
    config.access.update,
  )
  if (!rowUpdate) return forbidden()
  if (typeof rowUpdate === 'object') {
    const match = await req.payload.db.findOne({
      collection: slug,
      req,
      select: { id: true },
      where: combineQueries({ id: { equals: id } }, rowUpdate),
    })
    if (!match) return forbidden()
  }

  let fields: FlattenedField[] = config.flattenedFields
  let siblings: Row = doc
  const allows = async (field: FlattenedField | undefined) =>
    !field?.access?.update ||
    (await field.access.update({ data: doc, doc, id, req, siblingData: siblings }))

  for (const segment of segments.slice(0, -1)) {
    const field = fields.find((entry) => entry.name === segment)
    if (!field || !('flattenedFields' in field)) return notFound()
    if (!(await allows(field))) return forbidden()
    fields = field.flattenedFields
    siblings = isRecord(siblings[segment]) ? siblings[segment] : {}
  }

  const name = segments[segments.length - 1]
  const field = fields.find((entry) => entry.name === name)
  const marker = (field?.custom as { secret?: SecretFieldMarker } | undefined)?.secret
  if (!marker) return notFound()
  const control = fields.find((entry) => entry.name === changeFieldName(name))
  if (!(await allows(field)) || !(await allows(control))) return forbidden()
  return { resolved: { id, marker, path, siblings } }
}

/** The stored plaintext at `path`, read past the field's own `read: () => false`. */
async function readStored(
  req: PayloadRequest,
  slug: CollectionSlug,
  id: number | string,
  path: string,
): Promise<string | null> {
  const select = path
    .split('.')
    .reduceRight<Row | true>((inner, segment) => ({ [segment]: inner }), true) as Row
  // `overrideAccess: true` gets past the field's `read` lock, which strips the
  // value an access-checked read would decrypt.
  const row = await req.payload.findByID({
    collection: slug,
    depth: 0,
    id: String(id),
    overrideAccess: true,
    select,
  } as Parameters<typeof req.payload.findByID>[0])
  const value: unknown = getObjectDotNotation(row as unknown as Row, path)
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
        const { id, path } = gate.resolved

        const stored = await readStored(req, slug, id, path)
        const body: SecretStatus = { last4: stored ? stored.slice(-4) : null }
        return Response.json(body, noStore)
      },
    },
    {
      method: 'post',
      path: '/:id/secrets/:path',
      handler: async (req) => {
        const gate = await resolve(req, slug)
        if ('response' in gate) return gate.response
        const { id, marker, path, siblings } = gate.resolved

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

        const token = await stageSecret(req.payload, {
          collection: slug,
          id: String(id),
          path,
          // `requireActiveManager` admitted a `managers` user, so there is one.
          user: stagerOf(req.user) as string,
          value,
        })
        const body: SecretStaged = { token }
        return Response.json(body, noStore)
      },
    },
  ]
}
