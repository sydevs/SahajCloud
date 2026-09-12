import type { Trash } from './fixtures'

import { test as base } from '@playwright/test'

import { createTrash } from './fixtures'
import { authHeaders, ensureAdmin } from './preview'

/**
 * `test` for the specs that create records on the preview.
 *
 * Two fixtures, and the second is why this file exists:
 *
 * - `headers` logs the preview admin in once per test.
 * - `trash` is emptied in **fixture teardown**, not in the spec's own
 *   `finally`. Playwright abandons a test body when the 60 s timeout fires —
 *   and the Lectures spec waits on a third-party API inside that budget — but
 *   it still runs fixture teardown. A spec that cleaned up after itself would
 *   leave records, and Cloudflare Images uploads, behind on exactly the runs
 *   that went wrong.
 *
 * Specs that only read (`auth`, `cors-preflight`, `error-disclosure`) keep
 * importing `test` from `@playwright/test` — they have nothing to clean up.
 *
 * Playwright names the second argument `use`; it is positional, and this repo's
 * `react-hooks/rules-of-hooks` reads that name as a React hook call. `provide`
 * is the same function.
 */
export const test = base.extend<{ headers: Record<string, string>; trash: Trash }>({
  headers: async ({ request }, provide) => {
    await provide(authHeaders(await ensureAdmin(request)))
  },
  trash: async ({ request, headers }, provide) => {
    const bin = createTrash(request, headers)
    await provide(bin)
    await bin.empty()
  },
})

export { expect } from '@playwright/test'
