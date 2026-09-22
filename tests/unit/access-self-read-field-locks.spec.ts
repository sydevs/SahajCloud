import type { CollectionAfterReadHook, Config, FieldAccess, SanitizedCollectionConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { accessPlugin } from '@/plugins/access/accessPlugin'
import { stripLockedFieldsOnSelfRead } from '@/plugins/access/stripLockedFieldsOnSelfRead'

/**
 * `POST /api/clients/refresh-token` re-reads the row at `overrideAccess: true`,
 * so field access never runs and a browser-shipped key got its own plaintext
 * `apiKey` back (#822). The hole is Payload's auth operations, not `clients`,
 * so the guard is attached to every auth collection — these cases pin that it
 * denies exactly what the field locks deny, and that it is attached at all.
 */

const managersOnly: FieldAccess = ({ req }) => req.user?.collection === 'managers'

const collection = (slug: string, locked: string[]) =>
  ({
    slug,
    flattenedFields: [
      { name: 'name', type: 'text' },
      ...locked.map((name) => ({ name, type: 'text', access: { read: managersOnly } })),
    ],
  }) as unknown as SanitizedCollectionConfig

const read = async (
  args: { slug?: string; locked?: string[]; caller?: string | null },
  doc: Record<string, unknown>,
) =>
  (await (stripLockedFieldsOnSelfRead as CollectionAfterReadHook)({
    collection: collection(args.slug ?? 'clients', args.locked ?? ['apiKey', 'mailingList']),
    doc,
    req: { user: args.caller ? { collection: args.caller } : null },
  } as unknown as Parameters<CollectionAfterReadHook>[0])) as Record<string, unknown>

describe('stripLockedFieldsOnSelfRead', () => {
  it('strips a locked field the caller may not read', async () => {
    const doc = await read({ caller: 'clients' }, { name: 'Atlas', apiKey: 'PLAINTEXT' })
    expect(doc.apiKey).toBeUndefined()
    expect(doc.name).toBe('Atlas')
  })

  it('keeps a locked field the caller may read', async () => {
    // The blanket strip this replaced could not tell these two callers apart.
    const doc = await read({ slug: 'managers', caller: 'managers' }, { apiKey: 'PLAINTEXT' })
    expect(doc.apiKey).toBe('PLAINTEXT')
  })

  it('takes its field set from the collection, not a list here', async () => {
    const doc = await read(
      { caller: 'clients', locked: ['apiKey', 'mailingList', 'sixthSecret'] },
      { apiKey: 'A', mailingList: { provider: 'mailchimp' }, sixthSecret: 'S' },
    )
    expect(doc).toEqual({})
  })

  it('leaves a read by another collection alone', async () => {
    const doc = await read({ caller: 'managers' }, { apiKey: 'PLAINTEXT' })
    expect(doc.apiKey).toBe('PLAINTEXT')
  })

  it('leaves a server-side read alone', async () => {
    const doc = await read({ caller: null }, { apiKey: 'PLAINTEXT' })
    expect(doc.apiKey).toBe('PLAINTEXT')
  })
})

describe('accessPlugin wiring', () => {
  const build = (collections: unknown[]) =>
    accessPlugin()({ collections } as unknown as Config).collections as unknown as {
      slug: string
      hooks?: { afterRead?: unknown[] }
    }[]

  it('attaches the guard to an auth collection, after its own hooks', () => {
    const own = () => undefined
    const [clients] = build([
      { slug: 'clients', auth: { useAPIKey: true }, fields: [], hooks: { afterRead: [own] } },
    ])
    expect(clients.hooks?.afterRead).toEqual([own, stripLockedFieldsOnSelfRead])
  })

  it('leaves a non-auth collection without it', () => {
    const [pages] = build([{ slug: 'pages', fields: [] }])
    expect(pages.hooks?.afterRead ?? []).not.toContain(stripLockedFieldsOnSelfRead)
  })
})
