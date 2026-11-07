import { isAbsolute, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findInImportGraph, SRC } from '../utils/importGraph'

/**
 * Nothing the Payload config reaches may import the `react-dom/server` barrel.
 *
 * Another build failure CI cannot see, and the sibling of
 * `client-bundle-safety.spec.ts`: GitHub Actions does not build this app —
 * Railway does — so the barrel type-checks, passes every test, and then fails
 * the deploy with "You're importing a component that imports react-dom/server".
 * Turbopack refuses it anywhere in an app graph, and `payload.config.ts` is in
 * one: every endpoint handler hangs off it, and every server component that
 * loads the config drags the lot in. `wixBody.tsx` did exactly that.
 *
 * The barrel alone is refused. `react-dom/server.edge` exports the same
 * synchronous `renderToStaticMarkup` and is what a module here renders a string
 * with — so this guard is not "never render to a string", it is "not through the
 * entry point that picks a build at resolution time".
 */
const FORBIDDEN = 'react-dom/server'

describe('the Payload config graph', () => {
  it('imports no react-dom/server barrel', () => {
    const hit = findInImportGraph(`${SRC}/payload.config.ts`, (spec) =>
      spec === FORBIDDEN ? { spec } : null,
    )

    // Only the chain's first link is a file; every other is the specifier a
    // caller wrote, which is what a reader needs to find the import to cut.
    expect(
      hit && hit.chain.map((link) => (isAbsolute(link) ? relative(SRC, link) : link)),
      `${FORBIDDEN} is refused in an app graph — import react-dom/server.edge instead`,
    ).toBeNull()
  })
})
