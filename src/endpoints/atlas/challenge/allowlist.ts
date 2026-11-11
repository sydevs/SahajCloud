import type { Payload } from 'payload'

import { serverEnv } from '@/lib/env/server'

import { allowedParentHosts } from './challengeRequest'

/** Every active client's `site.domain`. About 31 rows, one query per frame load. */
async function activeClientDomains(payload: Payload): Promise<Array<string | null>> {
  const { docs } = await payload.find({
    collection: 'clients',
    where: { enabled: { equals: true } },
    select: { site: { domain: true } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((doc) => doc.site?.domain ?? null)
}

/**
 * The parent hosts the challenge renders for, read as the endpoint reads them on every frame load.
 *
 * ⚠ **`scripts/audit-challenge-parents.ts` judges stored mounts against this same call** (#1077),
 * so a change to who counts as active, or to the first-party list, reaches the audit too.
 */
export async function challengeParentAllowlist(payload: Payload): Promise<string[]> {
  return allowedParentHosts(
    [serverEnv.SAHAJATLAS_URL, serverEnv.WEMEDITATE_WEB_URL],
    await activeClientDomains(payload),
  )
}
