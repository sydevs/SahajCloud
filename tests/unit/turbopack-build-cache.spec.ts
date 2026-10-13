import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * Both levers are pinned because each reads as a plausible tidy-up alone.
 * They are coupled, not independent: the flag is what stops the panic, and
 * the `rm` only clears the copy Railpack restored. Re-enable the flag and the
 * `rm` goes with it, or every build deletes the store it just re-enabled.
 * Narrative: `DEPLOYMENT.md` and issue #932.
 */

describe('the Turbopack build cache', () => {
  it('is off in the config Next actually receives', () => {
    // Past `withPayload` and `withSentryConfig`: a wrapper that dropped the
    // key would leave the store on while the source still named the flag.
    expect(nextConfig.experimental?.turbopackFileSystemCacheForBuild).toBe(false)
  })

  it('is deleted before the build runs, not after', () => {
    const manifest = resolve(__dirname, '../../package.json')
    const { scripts } = JSON.parse(readFileSync(manifest, 'utf8'))

    expect(scripts.build).toMatch(/^rm -rf \.next\/cache\/turbopack && .*next build/)
  })
})
