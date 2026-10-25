import type { PayloadRequest, ServerProps } from 'payload'

import { DefaultNav } from '@payloadcms/next/rsc'
import React from 'react'

import { AtlasSidebar } from './AtlasSidebar'
import { isManagerInAtlasProject } from '../helpers/isManagerInAtlasProject'

/** Payload passes the Nav the standard server props plus the request. */
type AtlasNavProps = ServerProps & { req?: PayloadRequest }

/**
 * Custom admin Nav (registered as `admin.components.Nav`). A non-admin manager
 * working in the Sahaj Atlas project gets the purpose-built Atlas sidebar;
 * everyone else — admins, and managers on any other project — gets Payload's
 * `DefaultNav` unchanged.
 */
export default function AtlasNav(props: AtlasNavProps) {
  if (isManagerInAtlasProject(props.user)) {
    return <AtlasSidebar {...props} />
  }
  return <DefaultNav {...props} />
}
