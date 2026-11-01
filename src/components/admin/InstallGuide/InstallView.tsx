import type { DocumentViewServerProps } from 'payload'

import { Gutter } from '@payloadcms/ui'
import { combineQueries } from 'payload'
import { executeAccess } from 'payload'
import React from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { serverEnv } from '@/lib/env/server'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Client } from '@/payload-types'

import { CenteredNotice } from '../CenteredNotice'
import { InstallGuide } from './InstallGuide'

/**
 * The Install tab's server half (#1055).
 *
 * A server component, as every custom view here has to be — Payload hands a
 * view `locale` and `permissions` objects carrying methods, which a client
 * component cannot receive (`docs/rules/admin-ui.md`).
 *
 * **Its one job is the API key.** Payload strips a stored key from every read
 * (3.90+), so the only way to put it in front of a volunteer is
 * `payload.decrypt` on the raw column — which is why this reads the row through
 * the database adapter rather than through `payload.findByID`, and why it does
 * that **after** re-reading the document with the caller's own `req` and
 * `overrideAccess: false`. That read is the gate: a manager who does not manage
 * this service is refused there, and the tab is never rendered.
 *
 * ⚠ **This is the same authority `POST /api/clients/:id/api-key/reveal`
 * requires**, and all four of its gates are applied: admin access (by routing —
 * a document view is reachable only with read access to the row, which for
 * `clients` comes from the document-manager path), the `overrideAccess: false`
 * read below, the row's own `update` access, and the `apiKey` field's
 * `managersOnlyFieldAccess` lock. A tab that revealed a key to anyone who could
 * open the document would be a wider grant than that endpoint, on a page with no
 * button to press.
 *
 * ⚠ **The key reaches the browser as a prop, not as a POST response.** That is
 * the feature — every value on the tab is prefilled and copyable — so unlike the
 * endpoint there is no `Cache-Control: no-store` to lean on. What makes it safe
 * is that the route is cookie-authenticated and therefore uncacheable, and that
 * no session replay is configured. A page that ever becomes cacheable, or a
 * replay integration, makes this a disclosure: check both before changing
 * either.
 */
export default async function InstallView(
  props: DocumentViewServerProps,
): Promise<React.ReactElement> {
  const { initPageResult, doc } = props
  const { req } = initPageResult
  const clientId = Number(doc?.id ?? initPageResult.docID)

  if (!Number.isInteger(clientId)) {
    return (
      <Gutter>
        <CenteredNotice title="Not yet">
          Save this service first. There is nothing to install until it has a key.
        </CenteredNotice>
      </Gutter>
    )
  }

  // The gate. `overrideAccess: false` with the caller's own `req` is what makes
  // the document-manager path decide, exactly as it does for the edit view.
  let client: Client
  try {
    client = await req.payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 0,
      overrideAccess: false,
      req,
    })
  } catch {
    return (
      <Gutter>
        <CenteredNotice title="Not available">
          You do not manage this service, so its install details are not shown.
        </CenteredNotice>
      </Gutter>
    )
  }

  return (
    <Gutter>
      <h2>Install the atlas on {client.name}’s site</h2>
      <InstallGuide
        apiKey={await revealApiKey(props, clientId)}
        canonicalEmbed={client.canonical?.embed ?? null}
        clientId={clientId}
        cmsUrl={getServerUrl()}
        hasRegion={Boolean(client.region)}
        initialEmbedMetadata={(client.embedMetadata ?? null) as EmbedMetadata | null}
        initialVerification={
          (client.canonical?.verification ?? null) as CanonicalVerification | null
        }
        widgetUrl={serverEnv.SAHAJATLAS_URL}
      />
    </Gutter>
  )
}

/**
 * The service's own API key, in plaintext, or `null`.
 *
 * ⚠ **The `apiKey` field's `update` lock is evaluated here**, which is the last
 * gate Payload's own reveal endpoint applies. `managersOnlyFieldAccess` passes
 * any `managers` caller and refuses everyone else, so an anonymous or
 * client-authenticated request — which cannot reach a document view anyway —
 * gets nothing if one ever can.
 *
 * ⚠ **Read through the database adapter, not `payload.findByID`.** Every read
 * path runs `omitEncryptedAPIKey`, so the column is simply absent from a normal
 * read; the adapter's own `findOne` is what Payload's reveal endpoint uses for
 * the same reason.
 */
async function revealApiKey(
  props: DocumentViewServerProps,
  clientId: number,
): Promise<string | null> {
  const { req } = props.initPageResult
  if (req.user?.collection !== 'managers') return null

  try {
    // ⚠ **The row's `update` access, evaluated and combined into the query** —
    // the one gate the endpoint applies that routing does not. For `clients`
    // today `read` and `update` both fall to the same document-manager branch,
    // so this is equal to reaching the view at all; it is here because that
    // equality is an invariant nobody states, and `docs/rules/access.md` warns
    // this collection is where the next narrowed grant arrives. With one, the
    // tab would silently become wider than the endpoint it mirrors.
    const update = await executeAccess(
      { id: clientId, data: {}, disableErrors: true, req },
      req.payload.collections.clients.config.access.update,
    )
    if (!update) return null

    const row = await req.payload.db.findOne({
      collection: 'clients',
      req,
      select: { apiKey: true },
      where: combineQueries({ id: { equals: clientId } }, update),
    })
    const stored = (row as { apiKey?: unknown } | null)?.apiKey
    return typeof stored === 'string' ? req.payload.decrypt(stored) : null
  } catch (error) {
    req.payload.logger.error({
      msg: 'InstallView: could not reveal the API key',
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
