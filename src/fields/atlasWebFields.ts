import type { FieldHook, TextField } from 'payload'

import { getRegionWebPaths } from '@/lib/atlas/regionWebPaths'
import { serverEnv } from '@/lib/env/server'

/** Resolve a doc's canonical Atlas web path from the per-request region path map, or null. */
export type ResolveWebPath = (args: {
  data: Record<string, unknown>
  paths: Map<number, string>
}) => string | null

export interface AtlasWebFieldsOptions {
  /** Build the doc's canonical path (leading slash, host-less) from the region path map. */
  resolvePath: ResolveWebPath
  /**
   * Gate `webUrl` on `_status === 'published'`. Set for draft-enabled
   * collections (Events) so an unpublished doc exposes no public URL; omit for
   * Regions (no draft/status). `webPath` — the structural identity — is never
   * gated: it's the path a doc has (or will have) regardless of publish state.
   */
  requirePublished?: boolean
}

/** A virtual, read-only, list-hidden text field carrying a computed value. */
function virtualText(name: string, hook: FieldHook): TextField {
  return {
    name,
    type: 'text',
    virtual: true,
    admin: { readOnly: true, disableListColumn: true, disableListFilter: true },
    hooks: { afterRead: [hook] },
  }
}

/**
 * Build the virtual `webPath` + `webUrl` pair for an Atlas collection. Both are
 * computed on read from the shared per-request region path map (one `regions`
 * query per request — see {@link getRegionWebPaths}): `webPath` is the canonical
 * hierarchical path, `webUrl` joins it to the Atlas host (`SAHAJATLAS_URL`).
 * `resolvePath` maps a doc to its path — a region returns its own path; an event
 * appends `/<id>` to its region's.
 */
export function atlasWebFields({
  resolvePath,
  requirePublished = false,
}: AtlasWebFieldsOptions): TextField[] {
  // Static host — resolve the trailing-slash-trimmed base once at config build.
  const base = serverEnv.SAHAJATLAS_URL.replace(/\/+$/, '')

  const webPathHook: FieldHook = async ({ data, req }) => {
    const doc = data as Record<string, unknown> | undefined
    if (!doc) return null
    const paths = await getRegionWebPaths(req)
    return resolvePath({ data: doc, paths })
  }

  const webUrlHook: FieldHook = async ({ data, req }) => {
    const doc = data as Record<string, unknown> | undefined
    if (!doc || !base) return null
    if (requirePublished && doc._status !== 'published') return null
    const paths = await getRegionWebPaths(req)
    const path = resolvePath({ data: doc, paths })
    return path == null ? null : `${base}${path}`
  }

  return [virtualText('webPath', webPathHook), virtualText('webUrl', webUrlHook)]
}
