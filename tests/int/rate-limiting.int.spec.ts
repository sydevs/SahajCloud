/**
 * Rate Limiting Utility Tests
 *
 * Tests for the rate limiting utility functions:
 * - buildRateLimitKey: Composite key construction
 * - validateUserId: User ID format validation
 */
import { describe, expect, it } from 'vitest'

import {
  buildRateLimitKey,
  RateLimitValidationError,
  validateUserId,
} from '@/lib/usage'

describe('Rate Limiting Utilities', () => {
  describe('buildRateLimitKey', () => {
    it('should build key with all components provided', () => {
      const key = buildRateLimitKey('client-123', '192.168.1.1', 'user_abc12345')
      expect(key).toBe('user:client-123:192.168.1.1:user_abc12345')
    })

    it('should handle numeric client ID', () => {
      const key = buildRateLimitKey(42, '10.0.0.1', 'user_xyz78901')
      expect(key).toBe('user:42:10.0.0.1:user_xyz78901')
    })

    it('should use "no-ip" placeholder when IP is null', () => {
      const key = buildRateLimitKey('client-456', null, 'user_test1234')
      expect(key).toBe('user:client-456:no-ip:user_test1234')
    })

    it('should use "no-user-id" placeholder when userId is null', () => {
      const key = buildRateLimitKey('client-789', '172.16.0.1', null)
      expect(key).toBe('user:client-789:172.16.0.1:no-user-id')
    })

    it('should handle both IP and userId as null', () => {
      const key = buildRateLimitKey('client-000', null, null)
      expect(key).toBe('user:client-000:no-ip:no-user-id')
    })

    it('should handle IPv6 addresses', () => {
      const key = buildRateLimitKey('client-ipv6', '2001:0db8:85a3::8a2e:0370:7334', 'user_v6test12')
      expect(key).toBe('user:client-ipv6:2001:0db8:85a3::8a2e:0370:7334:user_v6test12')
    })
  })

  describe('validateUserId', () => {
    describe('valid formats', () => {
      it('should return userId for valid alphanumeric string (8 chars)', () => {
        const result = validateUserId('abcd1234')
        expect(result).toBe('abcd1234')
      })

      it('should return userId for valid alphanumeric string (64 chars)', () => {
        const longId = 'a'.repeat(64)
        const result = validateUserId(longId)
        expect(result).toBe(longId)
      })

      it('should return userId with dashes', () => {
        const result = validateUserId('user-id-with-dashes')
        expect(result).toBe('user-id-with-dashes')
      })

      it('should return userId with underscores', () => {
        const result = validateUserId('user_id_with_underscores')
        expect(result).toBe('user_id_with_underscores')
      })

      it('should return userId with mixed case', () => {
        const result = validateUserId('UserID_123-ABC')
        expect(result).toBe('UserID_123-ABC')
      })

      it('should return null when userId is null', () => {
        const result = validateUserId(null)
        expect(result).toBeNull()
      })
    })

    describe('invalid formats', () => {
      it('should throw for userId too short (7 chars)', () => {
        expect(() => validateUserId('abc1234')).toThrow(RateLimitValidationError)
        expect(() => validateUserId('abc1234')).toThrow(
          'Invalid X-User-ID format. Must be 8-64 alphanumeric characters (including dash and underscore).',
        )
      })

      it('should throw for userId too long (65 chars)', () => {
        const longId = 'a'.repeat(65)
        expect(() => validateUserId(longId)).toThrow(RateLimitValidationError)
      })

      it('should throw for userId with spaces', () => {
        expect(() => validateUserId('user id 1234')).toThrow(RateLimitValidationError)
      })

      it('should throw for userId with special characters', () => {
        expect(() => validateUserId('user@id.com!')).toThrow(RateLimitValidationError)
      })

      it('should return null for empty string (treated as missing)', () => {
        // Empty string is falsy, so it's treated as "no user ID provided"
        const result = validateUserId('')
        expect(result).toBeNull()
      })

      it('should throw for userId starting with special char', () => {
        expect(() => validateUserId('@username123')).toThrow(RateLimitValidationError)
      })

      it('should throw for userId with unicode characters', () => {
        expect(() => validateUserId('user_émoji_123')).toThrow(RateLimitValidationError)
      })
    })

    describe('RateLimitValidationError properties', () => {
      it('should have correct HTTP status', () => {
        try {
          validateUserId('short')
        } catch (error) {
          expect(error).toBeInstanceOf(RateLimitValidationError)
          expect((error as RateLimitValidationError).status).toBe(400)
        }
      })

      it('should have descriptive message', () => {
        try {
          validateUserId('bad!')
        } catch (error) {
          expect((error as Error).message).toContain('Invalid X-User-ID format')
          expect((error as Error).message).toContain('8-64')
          expect((error as Error).message).toContain('alphanumeric')
        }
      })
    })
  })
})
