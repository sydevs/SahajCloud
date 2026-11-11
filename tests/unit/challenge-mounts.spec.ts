import type { AuditedClient } from '../../scripts/challenge-mounts'

import { describe, expect, it } from 'vitest'

import { allowedParentHosts } from '@/endpoints/atlas/challenge/challengeRequest'
import type { EmbedMountRecord } from '@/lib/clients/embedMetadata'

import { refusedMounts, storedMounts } from '../../scripts/challenge-mounts'

const record = (
  mode: EmbedMountRecord['mode'],
  lastSeen = '2026-11-01T00:00:00.000Z',
): EmbedMountRecord => ({
  mode,
  topLevel: mode === 'inline',
  urlWritable: true,
  paramPersisted: true,
  routing: 'query',
  lastSeen,
})

const service = (
  id: number,
  domain: string | null,
  mounts: Record<string, EmbedMountRecord> = {},
  enabled = true,
): AuditedClient => ({
  id,
  name: `Service ${id}`,
  enabled,
  site: { domain },
  embedMetadata: mounts,
})

// The endpoint's own builder over the active services, as `challengeParentAllowlist` calls it.
const allowlistOf = (clients: AuditedClient[]) =>
  allowedParentHosts(
    ['https://sahajatlas.com', 'https://wemeditate.com'],
    clients.filter((c) => c.enabled).map((c) => c.site?.domain),
  )

const refuse = (clients: AuditedClient[]) =>
  refusedMounts(storedMounts(clients), allowlistOf(clients), clients)

const audit = (clients: AuditedClient[]) =>
  refuse(clients).map(({ client, mount }) => [client.id, mount])

describe('refusedMounts', () => {
  it('passes a mount whose host is another service’s domain — the allowlist is global', () => {
    expect(
      audit([
        service(1, null, { 'https://sahajayoga.fr/carte': record('inline') }),
        service(2, 'sahajayoga.fr'),
      ]),
    ).toEqual([])
  })

  it('reports a domainless service’s frozen mount, however old', () => {
    expect(
      audit([
        service(9, null, {
          'https://yogaessonne.fr/meditation': record('inline', '2025-01-02T00:00:00.000Z'),
        }),
      ]),
    ).toEqual([[9, 'https://yogaessonne.fr/meditation']])
  })

  it('judges an iframe mount by its own origin, which is what the widget sends', () => {
    expect(
      audit([
        service(1, null, {
          'https://sahajatlas.com/fr': record('iframe'),
          'https://partner.example/map': record('iframe'),
        }),
      ]),
    ).toEqual([[1, 'https://partner.example/map']])
  })

  it('judges a disabled service as if re-enabled, and lends its domain to no one else', () => {
    expect(
      audit([
        service(1, null, { 'https://sahajayoga.it/mappa': record('inline') }),
        service(
          2,
          'sahajayoga.it',
          {
            'https://sahajayoga.it/old': record('inline'),
            'https://other.example/old': record('inline'),
          },
          false,
        ),
      ]),
    ).toEqual([
      [1, 'https://sahajayoga.it/mappa'],
      [2, 'https://other.example/old'],
    ])
  })

  it('names the disabled service whose domain owns a refused host', () => {
    expect(
      refuse([
        service(1, null, { 'https://sahajayoga.it/mappa': record('inline') }),
        service(2, 'sahajayoga.it', {}, false),
      ]).map(({ client, mount, ownedBy }) => [client.id, mount, ownedBy?.id ?? null]),
    ).toEqual([[1, 'https://sahajayoga.it/mappa', 2]])
  })

  it('leaves a refused host no disabled service owns unattributed', () => {
    expect(
      refuse([
        service(1, null, { 'https://partner.example/map': record('inline') }),
        service(2, 'sahajayoga.it', {}, false),
      ]).map(({ ownedBy }) => ownedBy),
    ).toEqual([undefined])
  })

  it('passes a first-party host', () => {
    expect(audit([service(1, null, { 'https://wemeditate.com/map': record('inline') })])).toEqual(
      [],
    )
  })
})

describe('storedMounts', () => {
  it('lists every mount of every service, whatever its mode', () => {
    expect(
      storedMounts([
        service(1, 'a.example', { 'https://a.example/': record('inline') }),
        service(2, null, {
          'https://b.example/': record('inline'),
          'https://c.example/': record('iframe'),
        }),
      ]).map(({ client, mount }) => [client.id, mount]),
    ).toEqual([
      [1, 'https://a.example/'],
      [2, 'https://b.example/'],
      [2, 'https://c.example/'],
    ])
  })
})
