/**
 * `secretField`'s two hooks and its access block (#1109).
 *
 * The cipher itself is Payload's, so `encrypt`/`decrypt` are stubbed here and
 * what is asserted is the wiring around them: which values reach them, which
 * never do, and what a reader gets when one throws. Those three are what a
 * consumer depends on — `LIST_ELIGIBLE` tells a filled key from a blank one
 * with "not equal to the empty string", and a throw inside `afterRead` would
 * take down every read of the row.
 */
import type { FieldAccess, FieldHook, PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { secretField } from '@/fields/secretField'

const captured = vi.hoisted(() => vi.fn())
vi.mock('@/plugins/sentry/capture', () => ({ capture: captured }))

const encrypt = vi.fn((value: string) => `cipher(${value})`)
const decrypt = vi.fn((value: string) => value.replace(/^cipher\((.*)\)$/, '$1'))

const req = () =>
  ({
    payload: { decrypt, encrypt, logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
  }) as unknown as PayloadRequest

const allowAll: FieldAccess = () => true
const field = secretField({ name: 'apiKey', writeAccess: allowAll })

const run = (hook: FieldHook | undefined, value: unknown) =>
  hook!({ path: ['mailingList', 'apiKey'], req: req(), value } as never)

const onWrite = () => field.hooks?.beforeChange?.[0]
const onRead = () => field.hooks?.afterRead?.[0]

describe('secretField', () => {
  beforeEach(() => {
    captured.mockClear()
    encrypt.mockClear()
    decrypt.mockClear()
  })

  it('stores ciphertext and reads back the plaintext', async () => {
    const stored = await run(onWrite(), 'mailchimp-secret')
    expect(stored).toBe('cipher(mailchimp-secret)')
    expect(await run(onRead(), stored)).toBe('mailchimp-secret')
  })

  // Ciphertext for '' is a non-empty string, which would make
  // `LIST_ELIGIBLE`'s `not_equals: ''` always true — so a service with the
  // list switched on and no key would be offered as a region's list owner.
  it.each([
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('leaves %s alone in both directions', async (_name, value) => {
    expect(await run(onWrite(), value)).toBe(value)
    expect(await run(onRead(), value)).toBe(value)
    expect(encrypt).not.toHaveBeenCalled()
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('answers null for a value it cannot decrypt, and reports it', async () => {
    decrypt.mockImplementationOnce(() => {
      throw new Error('Invalid initialization vector')
    })

    // Never a throw: `afterRead` runs on every read of the row, so one would
    // take the whole document down rather than one column.
    expect(await run(onRead(), 'not-ciphertext')).toBeNull()
    expect(captured).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { field: 'mailingList.apiKey' } }),
    )
  })

  it('closes reads to everyone and takes the caller’s write lock', () => {
    expect(field.access?.read?.({} as never)).toBe(false)
    expect(field.access?.create).toBe(allowAll)
    expect(field.access?.update).toBe(allowAll)
  })

  // The value is in no form state, so Payload posts none of it into the live
  // preview iframe and a form save writes no older copy back.
  it('is disabled in the admin and never required', () => {
    expect(field.admin?.disabled).toBe(true)
    expect(field.required).toBeUndefined()
    expect(field.validate).toBeUndefined()
  })
})
