import type { DocumentTabServerProps } from 'payload'

import React from 'react'

import { InstallTabLink } from './InstallTabLink'

/**
 * The Install tab in a service's document header, shown only for a service
 * with the atlas role.
 *
 * A tab `condition` is synchronous and handed no document, so this is the tab's
 * own `Component`: it reads the id `Root` resolved from `req.routeParams` (as
 * `RegistrationsPill` does) and the row's roles, and renders nothing without
 * the role. On the create screen there is no id, and nothing to install.
 */
export default async function InstallTab({
  path,
  req,
}: DocumentTabServerProps): Promise<React.ReactElement | null> {
  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id)) return null

  const client = await req.payload.findByID({
    collection: 'clients',
    id,
    depth: 0,
    select: { roles: true },
    overrideAccess: true,
    disableErrors: true,
  })
  if (!client?.roles?.includes('sahaj-atlas-client')) return null

  return <InstallTabLink adminRoute={req.payload.config.routes.admin} path={path} />
}
