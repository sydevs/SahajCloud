/**
 * Rate Limiting Utility Tests
 */
import { describe, expect, it } from 'vitest'

import { buildRateLimitKey } from '@/plugins/usage'

describe('buildRateLimitKey', () => {
  it('builds composite key with all components', () => {
    expect(buildRateLimitKey('client-123', '192.168.1.1', 'user_abc12345')).toBe(
      'user:client-123:192.168.1.1:user_abc12345',
    )
    expect(buildRateLimitKey(42, '10.0.0.1', 'user_xyz')).toBe('user:42:10.0.0.1:user_xyz')
  })

  it('uses placeholders for null values', () => {
    expect(buildRateLimitKey('client', null, 'user_123')).toBe('user:client:no-ip:user_123')
    expect(buildRateLimitKey('client', '1.2.3.4', null)).toBe('user:client:1.2.3.4:no-user-id')
    expect(buildRateLimitKey('client', null, null)).toBe('user:client:no-ip:no-user-id')
  })
})
