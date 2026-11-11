import type { FieldAccess } from 'payload'

import { isAdminManager } from '@/plugins/access'

/** The Atlas-only settings, shown to a service holding the Atlas role. */
export const isAtlasClient = (data: { roles?: unknown }): boolean =>
  Array.isArray(data?.roles) && data.roles.includes('sahaj-atlas-client')

/**
 * The Atlas tab's lock: an admin, or the row's own atlas role (`roles` is admin-locked).
 *
 * ⚠ **Its own module because an endpoint writing an Atlas-tab field owes the same
 * answer.** `payload.update` applies it either way and silently strips what it
 * refuses, so a door that gated on less would report success having stored
 * nothing (`endpoints/mailingListKey.ts`).
 */
export const atlasWrites: FieldAccess = ({ req, doc, data }) =>
  isAdminManager(req.user) || isAtlasClient(doc ?? data ?? {})
