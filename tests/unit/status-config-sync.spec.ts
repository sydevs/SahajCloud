import { describe, expect, it } from 'vitest'

import committedConfig from '@/globals/WeMeditateAppStatus/statusConfig.json' with { type: 'json' }
import { WeMeditateAppStatusSpec } from '@/globals/WeMeditateAppStatus/WeMeditateAppStatus'
import { extractStatusConfig } from '@/lib/status'

describe('statusConfig.json drift guard', () => {
  it('matches the live extraction of WeMeditateAppStatusSpec', () => {
    // If this fails, the wm-app-status spec was edited without re-running
    // `pnpm generate:types` (which regenerates statusConfig.json via
    // `pnpm generate:statusConfig`). Re-run that command to sync.
    expect(extractStatusConfig(WeMeditateAppStatusSpec)).toEqual(committedConfig)
  })
})
