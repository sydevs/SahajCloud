import type { Endpoint } from 'payload'

import { z } from 'zod'

import { parseBody, requireActiveManager } from '@/lib/endpoints'
import { getLanguageOptions } from '@/lib/locales'
import type { EventImport } from '@/payload-types'
import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

import { failure, loadTarget, refuseUnownedTarget } from '../batchRequest'
import { parseImportCsv } from '../csv/parse'
import { isProposableTargetLevel } from '../propose/tree'

/**
 * Bounds what the CSV parser is handed.
 *
 * `MAX_IMPORT_ROWS` rows with every column filled is about 150 KB, so this
 * leaves more than ten times the headroom a real file needs. It is not a bound
 * on the request — the body is already in memory by the time a schema sees it —
 * but on the parse, which would otherwise build millions of records before the
 * row cap refused them.
 */
const MAX_CSV_CHARACTERS = 2_000_000

const bodySchema = z.object({
  targetRegion: z.int().positive(),
  csv: z.string().min(1).max(MAX_CSV_CHARACTERS),
  // The row-level default for every row whose own `languages` column is blank.
  // Validated against the same option set `Events.languages` offers, so a code
  // the collection would refuse cannot reach a row.
  defaultLanguages: z.array(z.string()).min(1),
})

/**
 * POST /api/event-imports/upload
 *
 * Takes a region and a CSV, and stages a batch for review. The Import tab calls
 * it first; everything after it addresses the batch by id.
 *
 * ⚠ **This is where the role check lands, and it is the only one in the
 * feature.** Every later endpoint gates on document ownership — the batch is
 * yours and its target is in your subtree — because `resolveManagedDocIds`
 * answers ownership and not role. That is sound only while the batch itself
 * could not exist without an `events: create` grant, which is what the check
 * below guarantees. `create` on `event-imports` is admins-only, so this is the
 * one path a manager reaches the collection by.
 *
 * ⚠ **The grant is read for the request's own locale.** `roles` is localized, so
 * a manager who coordinates in German holds nothing in English — asking without
 * a locale would answer about the default locale and deny them (#701). The tab
 * that calls this sends the admin locale it is rendered in.
 *
 * The CSV arrives as a JSON string rather than multipart: Payload wraps no
 * custom endpoint with its body parser (`docs/rules/endpoints.md`), so a
 * multipart upload would mean hand-rolling one for a payload the browser can
 * read with `File.text()` instead.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * region they manage, reached only from that region's Import tab. `managers`
 * sits in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is.
 */
export const uploadEventImport: Endpoint = {
  path: '/upload',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { targetRegion: targetId, csv, defaultLanguages } = parsed.data

    const mayCreateEvents = hasPermission(
      {
        user: req.user,
        collection: 'events',
        operation: 'create',
        locale: roleScopeFromLocale(req.locale),
      },
      bypassPermissions,
    )
    if (!mayCreateEvents) {
      return failure('You are not allowed to create classes in this language.', 403)
    }

    // `every` with a narrowing predicate is what makes the codes the column's
    // own union rather than bare strings, so the refusal below is the only path
    // an unknown code can take. The second pass runs only to name them.
    if (!defaultLanguages.every(isLanguageCode)) {
      const unknown = defaultLanguages.filter((code) => !isLanguageCode(code))
      return failure(`Not a language code: ${unknown.join(', ')}.`, 400)
    }

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)
    if (!isProposableTargetLevel(loaded.target.level)) {
      // The same refusal the propose step makes, made here so a volunteer reads
      // it before uploading rather than after reviewing. Neither is redundant:
      // a batch outlives this request, and a region's level can change under it.
      return failure(
        `A ${loaded.target.level} cannot hold imported classes' regions. Target a country, state or city.`,
        422,
      )
    }

    const file = parseImportCsv(csv)
    if (!file.ok) return failure(file.error, 422)

    const batch = await req.payload.create({
      collection: 'event-imports',
      data: {
        targetRegion: targetId,
        // ⚠ **The uploader is the caller, never the body.** `batchUploaderAccess`
        // is computed from this column, so a caller naming someone else would be
        // handing them a CSV of contact details — and naming a third party would
        // lock themselves out of the batch they just made.
        uploader: req.user!.id,
        status: 'uploaded',
        defaultLanguages,
        rows: file.rows,
      },
      // `create` is admins-only on the collection, deliberately: the three
      // checks above are what admits a manager, and they are stricter than a
      // role grant on the slug would be.
      overrideAccess: true,
      depth: 0,
      // The response needs the id alone, and the document just written carries
      // up to `MAX_IMPORT_ROWS` rows. `id` is not selectable — it always comes
      // back — so this asks for the cheapest column there is.
      select: { status: true },
      req,
    })

    const warn = loaded.warning ? { warning: loaded.warning } : {}
    return Response.json({ ...warn, id: batch.id, rows: file.rows.length })
  },
}

type LanguageCode = NonNullable<EventImport['defaultLanguages']>[number]

const KNOWN_LANGUAGES: ReadonlySet<string> = new Set(
  getLanguageOptions().map((option) => option.value),
)

function isLanguageCode(code: string): code is LanguageCode {
  return KNOWN_LANGUAGES.has(code)
}
