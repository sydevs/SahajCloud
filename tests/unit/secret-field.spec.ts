/**
 * `secretField()`'s two hooks, which decide what reaches the database and what
 * comes back. Both have a case where doing the obvious thing breaks something
 * far away: encrypting `''` would make `mailingListOwners`' `not_equals: ''`
 * predicate always true, and throwing on a bad decrypt would take down every
 * read of the row.
 */
import type { Field, FieldHook, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { secretField } from '@/fields/secretField'

vi.mock('@/plugins/sentry/capture', () => ({ capture: vi.fn(() => true) }))

const [control, field] = secretField({ name: 'apiKey', writeAccess: () => true })
const hooks = (field as Extract<Field, { hooks?: unknown }>).hooks as {
  afterRead: FieldHook[]
  beforeChange: FieldHook[]
  beforeValidate: FieldHook[]
}
const [encrypt] = hooks.beforeChange
const [decrypt] = hooks.afterRead
const [applyChange] = hooks.beforeValidate

const reqWith = (payload: Partial<PayloadRequest['payload']>): PayloadRequest =>
  ({ payload }) as PayloadRequest

const CIPHER = 'enc(secret-value)'
const working = reqWith({
  decrypt: (value: string) => value.replace(/^enc\((.*)\)$/, '$1'),
  encrypt: (value: string) => `enc(${value})`,
} as Partial<PayloadRequest['payload']>)

const run = (hook: FieldHook, value: unknown, req: PayloadRequest = working) =>
  hook({ req, value } as Parameters<FieldHook>[0])

describe('secretField', () => {
  it('is never readable and never required', () => {
    expect((field as { access?: { read?: () => boolean } }).access?.read?.()).toBe(false)
    expect(field).not.toHaveProperty('required')
    expect((field as { admin?: { disabled?: boolean } }).admin?.disabled).toBe(true)
  })

  it('puts its control first, as a virtual field that only carries an instruction', () => {
    // Payload checks each field's write lock in field order, after that field's
    // own hooks: the control's lock must strip a refused instruction before the
    // stored field's `beforeValidate` reads it.
    expect(control).toMatchObject({ name: 'apiKeyChange', type: 'text', virtual: true })
    expect(field).toMatchObject({ name: 'apiKey', custom: { secret: { dependsOn: [] } } })
  })

  it.each([
    ['no instruction', undefined, undefined],
    ['an empty instruction', '', undefined],
    ['an unknown instruction', 'plaintext-key', undefined],
    ['a removal', 'remove', ''],
  ])('resolves %s without reading any staged value', async (_name, change, expected) => {
    const result = await applyChange({
      req: working,
      siblingData: { apiKeyChange: change },
    } as unknown as Parameters<FieldHook>[0])
    expect(result).toBe(expected)
  })

  it('round-trips a value through both hooks', async () => {
    expect(await run(encrypt, 'secret-value')).toBe(CIPHER)
    expect(await run(decrypt, CIPHER)).toBe('secret-value')
  })

  it.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('leaves %s untouched both ways', async (_name, value) => {
    expect(await run(encrypt, value)).toBe(value)
    expect(await run(decrypt, value)).toBe(value)
  })

  it('answers null for a value it cannot decrypt, rather than throwing', async () => {
    const req = reqWith({
      decrypt: () => {
        throw new Error('bad ciphertext')
      },
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    } as unknown as Partial<PayloadRequest['payload']>)
    expect(run(decrypt, 'plaintext-left-over', req)).toBeNull()
  })
})
