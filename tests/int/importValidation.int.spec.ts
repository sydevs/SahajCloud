import { describe, it, expect } from 'vitest'
import { DataValidator, transformBoolean, transformDate, transformNumber, transformSlug } from '../../src/scripts/import/validation'
import type { ValidationRule } from '../../src/scripts/import/types'

describe('Import Validation Utilities', () => {
  describe('DataValidator', () => {
    it('validates required fields', () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ name: 'John' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ name: '' }, 2)
      expect(errors2).toHaveLength(1)
      expect(errors2[0].message).toBe('name is required')
      expect(errors2[0].row).toBe(2)

      const errors3 = validator.validate({}, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('name is required')
    })

    it('validates string type and length', () => {
      const rules: ValidationRule[] = [
        { 
          field: 'title', 
          type: 'string',
          minLength: 3,
          maxLength: 10
        }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ title: 'Hello' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ title: 'Hi' }, 2)
      expect(errors2).toHaveLength(1)
      expect(errors2[0].message).toBe('title must be at least 3 characters')

      const errors3 = validator.validate({ title: 'This is too long' }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('title must be at most 10 characters')

      const errors4 = validator.validate({ title: 123 }, 4)
      expect(errors4).toHaveLength(1)
      expect(errors4[0].message).toBe('title must be a string')
    })

    it('validates number type and range', () => {
      const rules: ValidationRule[] = [
        { 
          field: 'age', 
          type: 'number',
          min: 18,
          max: 100
        }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ age: 25 }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ age: '30' }, 2)
      expect(errors2).toHaveLength(0) // String numbers are accepted

      const errors3 = validator.validate({ age: 10 }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('age must be at least 18')

      const errors4 = validator.validate({ age: 150 }, 4)
      expect(errors4).toHaveLength(1)
      expect(errors4[0].message).toBe('age must be at most 100')

      const errors5 = validator.validate({ age: 'not a number' }, 5)
      expect(errors5).toHaveLength(1)
      expect(errors5[0].message).toBe('age must be a number')
    })

    it('validates boolean type', () => {
      const rules: ValidationRule[] = [
        { field: 'active', type: 'boolean' }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ active: true }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ active: 'true' }, 2)
      expect(errors2).toHaveLength(0)

      const errors3 = validator.validate({ active: '1' }, 3)
      expect(errors3).toHaveLength(0)

      const errors4 = validator.validate({ active: 'invalid' }, 4)
      expect(errors4).toHaveLength(1)
      expect(errors4[0].message).toBe('active must be a boolean')
    })

    it('validates date type', () => {
      const rules: ValidationRule[] = [
        { field: 'birthDate', type: 'date' }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ birthDate: '2023-01-01' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ birthDate: new Date().toISOString() }, 2)
      expect(errors2).toHaveLength(0)

      const errors3 = validator.validate({ birthDate: 'invalid date' }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('birthDate must be a valid date')
    })

    it('validates email type', () => {
      const rules: ValidationRule[] = [
        { field: 'email', type: 'email' }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ email: 'test@example.com' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ email: 'invalid-email' }, 2)
      expect(errors2).toHaveLength(1)
      expect(errors2[0].message).toBe('email must be a valid email')

      const errors3 = validator.validate({ email: '@example.com' }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('email must be a valid email')
    })

    it('validates URL type', () => {
      const rules: ValidationRule[] = [
        { field: 'website', type: 'url' }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ website: 'https://example.com' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ website: 'http://localhost:3000' }, 2)
      expect(errors2).toHaveLength(0)

      const errors3 = validator.validate({ website: 'not-a-url' }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('website must be a valid URL')
    })

    it('validates pattern', () => {
      const rules: ValidationRule[] = [
        { 
          field: 'slug', 
          pattern: /^[a-z0-9-]+$/
        }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ slug: 'valid-slug-123' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ slug: 'Invalid_Slug' }, 2)
      expect(errors2).toHaveLength(1)
      expect(errors2[0].message).toBe('slug does not match the required pattern')
    })

    it('validates with custom validator', () => {
      const rules: ValidationRule[] = [
        { 
          field: 'password',
          custom: (value) => {
            if (value.length < 8) return 'Password must be at least 8 characters'
            if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter'
            if (!/[0-9]/.test(value)) return 'Password must contain number'
            return null
          }
        }
      ]
      const validator = new DataValidator(rules)

      const errors1 = validator.validate({ password: 'ValidPass123' }, 1)
      expect(errors1).toHaveLength(0)

      const errors2 = validator.validate({ password: 'short' }, 2)
      expect(errors2).toHaveLength(1)
      expect(errors2[0].message).toBe('Password must be at least 8 characters')

      const errors3 = validator.validate({ password: 'nouppercasehere' }, 3)
      expect(errors3).toHaveLength(1)
      expect(errors3[0].message).toBe('Password must contain uppercase letter')

      const errors4 = validator.validate({ password: 'NoNumbersHere' }, 4)
      expect(errors4).toHaveLength(1)
      expect(errors4[0].message).toBe('Password must contain number')
    })

    it('validates multiple fields and returns all errors', () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true },
        { field: 'email', type: 'email', required: true },
        { field: 'age', type: 'number', min: 18 }
      ]
      const validator = new DataValidator(rules)

      const errors = validator.validate({ 
        email: 'invalid',
        age: 10
      }, 1)

      expect(errors).toHaveLength(3)
      expect(errors.find(e => e.field === 'name')?.message).toBe('name is required')
      expect(errors.find(e => e.field === 'email')?.message).toBe('email must be a valid email')
      expect(errors.find(e => e.field === 'age')?.message).toBe('age must be at least 18')
    })
  })

  describe('Transform Functions', () => {
    it('transformBoolean converts various inputs to boolean', () => {
      expect(transformBoolean(true)).toBe(true)
      expect(transformBoolean(false)).toBe(false)
      expect(transformBoolean('true')).toBe(true)
      expect(transformBoolean('True')).toBe(true)
      expect(transformBoolean('TRUE')).toBe(true)
      expect(transformBoolean('1')).toBe(true)
      expect(transformBoolean('yes')).toBe(true)
      expect(transformBoolean('y')).toBe(true)
      expect(transformBoolean('false')).toBe(false)
      expect(transformBoolean('0')).toBe(false)
      expect(transformBoolean('no')).toBe(false)
      expect(transformBoolean('anything else')).toBe(false)
    })

    it('transformDate converts various inputs to Date', () => {
      const dateStr = '2023-01-01'
      const date = new Date(dateStr)
      
      expect(transformDate(date)).toEqual(date)
      expect(transformDate(dateStr)).toEqual(date)
      expect(transformDate('2023-01-01T00:00:00.000Z')).toEqual(date)
    })

    it('transformNumber converts various inputs to number', () => {
      expect(transformNumber(123)).toBe(123)
      expect(transformNumber('123')).toBe(123)
      expect(transformNumber('123.45')).toBe(123.45)
      expect(transformNumber('-123')).toBe(-123)
      expect(transformNumber('not a number')).toBe(NaN)
    })

    it('transformSlug creates URL-friendly slugs', () => {
      expect(transformSlug('Hello World')).toBe('hello-world')
      expect(transformSlug('Test 123!')).toBe('test-123')
      expect(transformSlug('Multiple   Spaces')).toBe('multiple-spaces')
      expect(transformSlug('Special@#$Characters')).toBe('specialcharacters')
      expect(transformSlug('  Trim Me  ')).toBe('trim-me')
      expect(transformSlug('Already-slug-123')).toBe('already-slug-123')
    })
  })
})