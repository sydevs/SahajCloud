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
  const hook = restrictUploadToAdmin({ label: 'audio file on a meditation' })

  describe('replacement (admin managers only)', () => {
    it('allows an admin manager to replace an existing file', () => {
      expect(() =>
        callHook(hook, { user: adminManager, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('blocks a non-admin manager from replacing an existing file (403)', () => {
      const err = captureThrow(() =>
        callHook(hook, { user: editorManager, file: {}, originalDoc: { filename: 'a.mp3' } }),
      )
      expect(err.status).toBe(403)
      expect(err.message).toMatch(/Only admins can replace the audio file on a meditation/)
    })

    it('allows trusted system/seed calls (no user) to replace', () => {
      expect(() =>
        callHook(hook, { user: null, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('allows API clients to replace', () => {
      expect(() =>
        callHook(hook, { user: apiClient, file: {}, originalDoc: { filename: 'a.mp3' } }),
      ).not.toThrow()
    })

    it('allows a non-admin manager to upload when there was no prior file', () => {
      // Not a "replace" — nothing to overwrite, so the guard stays out of the way.
      expect(() =>
        callHook(hook, { user: editorManager, file: {}, originalDoc: { filename: undefined } }),
      ).not.toThrow()
    })

    it('treats remove-then-add (a new file is present) as a replacement, not a removal', () => {
      // The native Upload replace flow clears `filename` to null and stages a new
      // file. Because `req.file` is present it is a replacement (admin-gated), not
      // a removal.
      expect(() =>
        callHook(hook, {
          user: adminManager,
          file: {},
          data: { filename: null },
          originalDoc: { filename: 'a.mp3' },
        }),
      ).not.toThrow()

      const err = captureThrow(() =>
        callHook(hook, {
          user: editorManager,
          file: {},
          data: { filename: null },
          originalDoc: { filename: 'a.mp3' },
        }),
      )
      expect(err.message).toMatch(/Only admins can replace/)
    })
  })

  describe('removal without replacement (blocked for everyone)', () => {
    // A removal is a strict `filename: null` with no staged replacement file.
    const removal = { data: { filename: null }, originalDoc: { filename: 'a.mp3' } }

    it('blocks a non-admin manager (403)', () => {
      const err = captureThrow(() => callHook(hook, { ...removal, user: editorManager }))
      expect(err.status).toBe(403)
      expect(err.message).toMatch(/The audio file on a meditation cannot be removed/)
    })

    it('blocks an admin manager too', () => {
      const err = captureThrow(() => callHook(hook, { ...removal, user: adminManager }))
      expect(err.message).toMatch(/cannot be removed/)
    })

    it('blocks a system/seed call (no user)', () => {
      const err = captureThrow(() => callHook(hook, { ...removal, user: null }))
      expect(err.message).toMatch(/cannot be removed/)
    })

    it('blocks an API client', () => {
      const err = captureThrow(() => callHook(hook, { ...removal, user: apiClient }))
      expect(err.message).toMatch(/cannot be removed/)
    })
  })

  describe('out-of-scope operations and partial updates', () => {
    it('ignores create operations', () => {
      expect(() =>
        callHook(hook, { operation: 'create', user: editorManager, file: {} }),
      ).not.toThrow()
    })

    it('allows a filename:null update on a doc that never had a file', () => {
      expect(() => callHook(hook, { user: editorManager, data: { filename: null } })).not.toThrow()
    })

    it('does not treat a partial update that omits filename as a removal', () => {
      expect(() =>
        callHook(hook, {
          user: editorManager,
          data: { title: 'new title' },
          originalDoc: { filename: 'a.mp3' },
        }),
      ).not.toThrow()
    })
  })
})
