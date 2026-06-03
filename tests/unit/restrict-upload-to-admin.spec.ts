import { describe, expect, it } from 'vitest'

// Import directly from the file (not the @/plugins/access barrel) to keep the
// unit lane light — the barrel pulls in accessPlugin and its config graph.
import { restrictUploadToAdmin } from '@/plugins/access/restrictUploadToAdmin'

type Hook = ReturnType<typeof restrictUploadToAdmin>
type HookArg = Parameters<Hook>[0]

const adminManager = { collection: 'managers', type: 'admin' }
const editorManager = { collection: 'managers', type: 'manager' }
const apiClient = { collection: 'clients' }

/** Invoke a built hook with a minimal mocked beforeChange arg. */
function callHook(
  hook: Hook,
  {
    data = {},
    operation = 'update',
    originalDoc,
    user,
    file,
  }: {
    data?: Record<string, unknown>
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    user?: { collection: string; type?: string } | null
    file?: unknown
  } = {},
) {
  return hook({ data, operation, originalDoc, req: { user, file } } as unknown as HookArg)
}

/** Run a thrower and return the caught error, failing if nothing was thrown. */
function captureThrow(fn: () => unknown): Error & { status?: number } {
  try {
    fn()
  } catch (err) {
    return err as Error & { status?: number }
  }
  throw new Error('expected the hook to throw, but it returned')
}

describe('restrictUploadToAdmin', () => {
  const audioHook = restrictUploadToAdmin({
    label: 'audio file on a meditation',
    blockRemoval: true,
  })
  const iconHook = restrictUploadToAdmin({ label: 'icon on a user choice' })

  describe('replacement', () => {
    it('allows an admin manager to replace an existing file', () => {
      expect(() =>
        callHook(audioHook, { user: adminManager, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('blocks a non-admin manager from replacing an existing file (403)', () => {
      const err = captureThrow(() =>
        callHook(audioHook, { user: editorManager, file: {}, originalDoc: { filename: 'a.mp3' } }),
      )
      expect(err.status).toBe(403)
      expect(err.message).toMatch(/Only admins can replace the audio file on a meditation/)
    })

    it('allows a non-admin manager to upload when there was no prior file', () => {
      // Not a "replace" — nothing to overwrite, so the guard stays out of the way.
      expect(() =>
        callHook(audioHook, {
          user: editorManager,
          file: {},
          originalDoc: { filename: undefined },
        }),
      ).not.toThrow()
    })
  })

  describe('removal', () => {
    it('blocks a non-admin manager from removing the file when blockRemoval is set (403)', () => {
      const err = captureThrow(() =>
        callHook(audioHook, {
          user: editorManager,
          data: { filename: null },
          originalDoc: { filename: 'a.mp3' },
        }),
      )
      expect(err.status).toBe(403)
      expect(err.message).toMatch(/Only admins can remove the audio file on a meditation/)
    })

    it('allows a non-admin manager to remove the file when blockRemoval is not set', () => {
      expect(() =>
        callHook(iconHook, {
          user: editorManager,
          data: { filename: null },
          originalDoc: { filename: 'a.svg' },
        }),
      ).not.toThrow()
    })

    it('does not treat an omitted filename as a removal', () => {
      // A partial update that leaves `filename` undefined (not null) is not a
      // removal — only a strict null signals an intentional clear.
      expect(() =>
        callHook(audioHook, {
          user: editorManager,
          data: { title: 'new title' },
          originalDoc: { filename: 'a.mp3' },
        }),
      ).not.toThrow()
    })
  })

  describe('out-of-scope callers and operations', () => {
    it('ignores create operations', () => {
      expect(() =>
        callHook(audioHook, { operation: 'create', user: editorManager, file: {} }),
      ).not.toThrow()
    })

    it('allows trusted system/seed calls (no user)', () => {
      expect(() =>
        callHook(audioHook, { user: null, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('allows API clients', () => {
      expect(() =>
        callHook(audioHook, { user: apiClient, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('allows a non-admin manager scalar update that does not touch the file', () => {
      expect(() =>
        callHook(audioHook, {
          user: editorManager,
          data: { title: 'x' },
          originalDoc: { filename: 'a.mp3' },
        }),
      ).not.toThrow()
    })
  })
})
