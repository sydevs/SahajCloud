import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { deleteChildren } from '@/lib/cascadeDeletion'

/**
 * The bulk delete `deleteChildren` runs reports a row it could not delete in
 * `errors` and resolves anyway, so only the hook's own check stands between
 * that and a parent deleted over a surviving child. A real child refusal is
 * hard to stage through Payload, so the delete's answer is stubbed here.
 */
describe('deleteChildren', () => {
  const run = (errors: Array<{ id: number; isPublic: boolean; message: string }>) => {
    const req = {
      payload: { collections: {}, delete: vi.fn().mockResolvedValue({ docs: [], errors }) },
    } as unknown as PayloadRequest
    const hook = deleteChildren({ collection: 'songs', field: 'album' })
    return hook({ collection: { slug: 'albums' }, id: 7, req } as never)
  }

  it('lets the parent go when every child was deleted', async () => {
    await expect(run([])).resolves.toBeUndefined()
  })

  it('fails the parent’s delete when a child could not be deleted', async () => {
    await expect(
      run([{ id: 3, isPublic: true, message: 'Song #3 is in use.' }]),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Song #3 is in use.'),
      isPublic: true,
    })
  })

  it('keeps the failure private when any child’s was', async () => {
    await expect(
      run([
        { id: 3, isPublic: true, message: 'in use' },
        { id: 4, isPublic: false, message: 'connection reset' },
      ]),
    ).rejects.toMatchObject({ isPublic: false })
  })
})
