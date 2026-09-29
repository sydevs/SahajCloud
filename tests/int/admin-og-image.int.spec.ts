import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import configPromise from '@/payload.config'

import { clientEntries, SRC } from '../utils/importGraph'

const ICON = 'components/branding/Icon'

/**
 * #868 — `@payloadcms/next` pushes its own `get /og` endpoint into
 * `config.endpoints` on the first REST request, and that handler renders
 * `admin.components.graphics.Icon` as a SERVER component
 * (`routes/rest/og/image.js`, via `RenderServerComponent`). Our Icon is a
 * client component reading `useProject()`, so the render throws inside an
 * already-streaming `ImageResponse` — past the handler's own try/catch, which
 * is why the edge answered 502 rather than a 500. `defaultOGImageType: 'off'`
 * makes the handler return a 400 before it renders anything.
 *
 * The three assertions are one coupling, not three facts. The switch may be
 * reverted only once the slot renders on a server, so the spec pins which
 * component fills the slot and that it is still a client entry. Repointing the
 * slot fails here, which is where the revert gets decided — the admin chrome
 * shares that slot and needs the client component.
 *
 * `clientEntries()` owns what counts as a `'use client'` file, cross-checked
 * against a TypeScript parse in `client-bundle-safety.spec.ts`. A second
 * definition here would drift out of that oracle.
 */
describe('admin Open Graph images', () => {
  it('are disabled, because the Icon slot cannot render on the server', async () => {
    const config = await configPromise

    expect(config.admin.meta.defaultOGImageType).toBe('off')
    expect(config.admin.components.graphics?.Icon).toBe(`@/${ICON}`)
    expect(clientEntries()).toContain(join(SRC, `${ICON}.tsx`))
  })
})
