import { describe, expect, it } from 'vitest'

import { WeMeditateAppStatusSpec } from '@/globals/wemeditate-app/status'
import committedConfig from '@/globals/wemeditate-app/statusConfig.json' with { type: 'json' }
import { extractStatusConfig } from '@/lib/status'

describe('statusConfig.json drift guard', () => {
  it('matches the live extraction of WeMeditateAppStatusSpec', () => {
    // If this fails, the wm-app-status spec was edited without re-running
    // `pnpm generate:types` (which regenerates statusConfig.json via
    // `pnpm generate:statusConfig`). Re-run that command to sync.
    expect(extractStatusConfig(WeMeditateAppStatusSpec)).toEqual(committedConfig)
  })
})
