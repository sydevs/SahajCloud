import type { Endpoint, PayloadRequest } from 'payload'

import { createElement } from 'react'
import { z } from 'zod'

import { RegistrationConfirmationEmail } from '@/emails/RegistrationConfirmationEmail'
import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'
import type { LocaleCode } from '@/lib/locales'
import { resolveEmailStrings } from '@/lib/translations/emailStrings'
import type { Client, Image } from '@/payload-types'
import { getClientEmailBrand, renderEmail } from '@/plugins/email'

const bodySchema = z.object({
  color1: z.string().nullish(),
  color2: z.string().nullish(),
  logo: z.union([z.number(), z.string()]).nullish(),
  name: z.string().nullish(),
})

/**
 * One fixed class and registrant, so the sample shows the branding rather than
 * the data: nothing here is read from the database, and no row is touched.
 */
const SAMPLE = {
  contact: null,
  description: null,
  eventTitle: 'Thursday Evening Meditation',
  location: { type: 'online' as const, joinUrl: 'https://example.org/join' },
  scheduleLine: 'Every Thursday, 7:00 – 8:30 PM',
  sessions: 4,
}

/**
 * `POST /api/clients/:id/email-preview`
 *
 * The registrant confirmation this service's logo and colours would produce,
 * rendered from values the manager has not saved yet — so the one email a
 * service's branding reaches is visible beside the fields that decide it.
 *
 * Admin-panel only, so it skips the API-client guard: {@link requireActiveManager}
 * plus the row's own read access admit `managers` callers alone.
 */
export const clientEmailPreview: Endpoint = {
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id)) return errorResponse('Invalid service id.', 400)

    // ⚠ `overrideAccess: false`, with the caller's own `req`: a manager who does
    // not manage this service gets the 404 the document-manager path gives them.
    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        depth: 0,
        id,
        overrideAccess: false,
        req,
      })
    } catch {
      return errorResponse('Service not found.', 404)
    }

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    const brand = getClientEmailBrand({
      color1: parsed.data.color1 ?? null,
      color2: parsed.data.color2 ?? null,
      logo: await loadLogo(req, parsed.data.logo),
      site: client.site,
      title: parsed.data.name ?? null,
    })

    const { html } = await renderEmail(
      createElement(RegistrationConfirmationEmail, {
        brand,
        details: SAMPLE,
        locale: (client.language ?? null) as LocaleCode | null,
        name: 'Maria Rossi',
        strings: await resolveEmailStrings({
          locale: (client.language ?? null) as LocaleCode | null,
          payload: req.payload,
          req,
        }),
        websiteUrl: null,
      }),
    )

    return Response.json({ html }, { headers: { 'Cache-Control': 'no-store' } })
  },
  method: 'post',
  path: '/:id/email-preview',
}

/** The posted logo, read as the caller — an image they cannot read is no logo. */
async function loadLogo(req: PayloadRequest, logo: unknown): Promise<Image | null> {
  if (typeof logo !== 'number' && typeof logo !== 'string') return null

  try {
    return await req.payload.findByID({
      collection: 'images',
      id: logo,
      overrideAccess: false,
      req,
    })
  } catch {
    return null
  }
}
