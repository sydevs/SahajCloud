import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * A Railway build must carry no Turbopack store between builds. The panic
 * this prevents is in `next.config.mjs` and issue #932.
 *
 * The flag is what stops the panic. The `rm` is what stops Railpack's cache
 * mount carrying a directory nothing reads any more, and is the only way to
 * clear the copy it has already restored — nobody can reach a builder. Both
 * are pinned because each is a plausible tidy-up on its own.
 */

describe('the Turbopack build cache', () => {
  it('is off in the config Next actually receives', () => {
    // The assertion reads the default export, past `withPayload` and
    // `withSentryConfig` — a wrapper that dropped the key would leave the
    // store on while `nextConfig` still named it.
    expect(nextConfig.experimental?.turbopackFileSystemCacheForBuild).toBe(false)
  })

  it('is deleted before the build runs, not after', () => {
    const manifest = resolve(__dirname, '../../package.json')
    const { scripts } = JSON.parse(readFileSync(manifest, 'utf8'))

    expect(scripts.build).toMatch(/^rm -rf \.next\/cache\/turbopack && .*next build/)
  })
})
