import type { AuditedClient } from '../../scripts/challenge-parents'

import { describe, expect, it } from 'vitest'

import { challengeAllowlist, refusedMounts } from '../../scripts/challenge-parents'

const FIRST_PARTY = ['https://sahajatlas.com', 'https://wemeditate.com']

const mount = (mode: 'inline' | 'iframe', lastSeen = '2026-11-01T00:00:00.000Z') => ({
  mode,
  topLevel: mode === 'inline',
  urlWritable: true,
  paramPersisted: true,
  routing: 'query' as const,
  lastSeen,
})

const audit = (clients: AuditedClient[]) =>
  refusedMounts(clients, challengeAllowlist(FIRST_PARTY, clients))

describe('refusedMounts', () => {
  it('passes a mount whose host is another service’s domain — the allowlist is global', () => {
    const clients: AuditedClient[] = [
      {
        id: 1,
        name: 'A',
        enabled: true,
        site: { domain: null },
        embedMetadata: {
          'https://sahajayoga.fr/carte': mount('inline'),
        },
      },
      { id: 2, name: 'B', enabled: true, site: { domain: 'sahajayoga.fr' } },
    ]
    expect(audit(clients)).toEqual([])
  })

  it('passes the www twin of a service’s domain', () => {
    const clients: AuditedClient[] = [
      {
        id: 1,
        enabled: true,
        site: { domain: 'sahajayoga.ca' },
        embedMetadata: {
          'https://www.sahajayoga.ca/map': mount('inline'),
        },
      },
    ]
    expect(audit(clients)).toEqual([])
  })

  it('reports a domainless service’s frozen mount, however old', () => {
    const clients: AuditedClient[] = [
      { id: 7, name: 'Sahaja Yoga FR', enabled: true, site: { domain: 'sahajayoga.fr' } },
      {
        id: 9,
        name: 'Old',
        enabled: true,
        site: { domain: null },
        embedMetadata: {
          'https://yogaessonne.fr/meditation': mount('inline', '2025-01-02T00:00:00.000Z'),
        },
      },
    ]
    expect(audit(clients)).toEqual([
      {
        clientId: 9,
        client: 'Old',
        enabled: true,
        domain: null,
        origin: 'https://yogaessonne.fr',
        mount: 'https://yogaessonne.fr/meditation',
        lastSeen: '2025-01-02T00:00:00.000Z',
      },
    ])
  })

  it('ignores an iframe mount, whose parent is the widget’s own page', () => {
    const clients: AuditedClient[] = [
      {
        id: 1,
        enabled: true,
        site: { domain: null },
        embedMetadata: {
          'https://example.org/map': mount('iframe'),
        },
      },
    ]
    expect(audit(clients)).toEqual([])
  })

  it('grants nothing for a disabled service’s domain, and flags its own mounts', () => {
    const clients: AuditedClient[] = [
      {
        id: 1,
        enabled: true,
        site: { domain: null },
        embedMetadata: {
          'https://sahajayoga.it/mappa': mount('inline'),
        },
      },
      {
        id: 2,
        enabled: false,
        site: { domain: 'sahajayoga.it' },
        embedMetadata: {
          'https://sahajayoga.it/old': mount('inline'),
        },
      },
    ]
    const rows = audit(clients)
    expect(rows.map((r) => [r.clientId, r.enabled])).toEqual([
      [1, true],
      [2, false],
    ])
  })

  it('passes first-party hosts, their subdomains and loopback', () => {
    const clients: AuditedClient[] = [
      {
        id: 1,
        enabled: true,
        site: { domain: null },
        embedMetadata: {
          'https://wemeditate.com/map': mount('inline'),
          'https://play.sahajatlas.com/': mount('inline'),
          'http://localhost:5173/': mount('inline'),
        },
      },
    ]
    expect(audit(clients)).toEqual([])
  })
})
