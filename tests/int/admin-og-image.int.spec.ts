import fs from 'fs'
import path from 'path'

import { describe, expect, it } from 'vitest'

import configPromise from '@/payload.config'

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
 * The two assertions are one coupling, not two facts. The switch may be
 * reverted only once the Icon slot is server-safe, and that slot feeds the
 * admin chrome too — which needs the client component. So the second
 * assertion is what tells a future reader the first one is still load-bearing.
 */
describe('admin Open Graph images', () => {
  it('are disabled, because the Icon slot cannot render on the server', async () => {
    const config = await configPromise

    expect(config.admin.meta.defaultOGImageType).toBe('off')

    const icon = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/branding/Icon.tsx'),
      'utf8',
    )

    expect(icon.startsWith("'use client'")).toBe(true)
  })
})
