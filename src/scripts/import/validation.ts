import type { ValidationRule, ImportError } from './types'

export class DataValidator {
  private rules: ValidationRule[]

  constructor(rules: ValidationRule[]) {
    this.rules = rules
  }

  validate(data: Record<string, any>, rowIndex: number): ImportError[] {
    const errors: ImportError[] = []

    for (const rule of this.rules) {
      const value = data[rule.field]
      const error = this.validateField(rule, value, data)
      
      if (error) {
        errors.push({
          row: rowIndex,
          field: rule.field,
          message: error,
          data
        })
      }
    }

    return errors
  }

  private validateField(rule: ValidationRule, value: any, data: Record<string, any>): string | null {
    // Check required
    if (rule.required && (value === null || value === undefined || value === '')) {
      return `${rule.field} is required`
    }

    // Skip further validation if value is empty and not required
    if (!rule.required && (value === null || value === undefined || value === '')) {
      return null
    }

    // Type validation
    if (rule.type) {
      switch (rule.type) {
        case 'string':
          if (typeof value !== 'string') {
            return `${rule.field} must be a string`
          }
          break
        case 'number':
          if (typeof value !== 'number' && isNaN(Number(value))) {
            return `${rule.field} must be a number`
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean' && !['true', 'false', '1', '0'].includes(String(value).toLowerCase())) {
            return `${rule.field} must be a boolean`
          }
          break
        case 'date':
          if (isNaN(Date.parse(value))) {
            return `${rule.field} must be a valid date`
          }
          break
        case 'email':
          if (!this.isValidEmail(value)) {
            return `${rule.field} must be a valid email`
          }
          break
        case 'url':
          if (!this.isValidUrl(value)) {
            return `${rule.field} must be a valid URL`
          }
          break
      }
    }

    // String length validation
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        return `${rule.field} must be at least ${rule.minLength} characters`
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return `${rule.field} must be at most ${rule.maxLength} characters`
      }
    }

    // Number range validation
    if (typeof value === 'number' || !isNaN(Number(value))) {
      const numValue = Number(value)
      if (rule.min !== undefined && numValue < rule.min) {
        return `${rule.field} must be at least ${rule.min}`
      }
      if (rule.max !== undefined && numValue > rule.max) {
        return `${rule.field} must be at most ${rule.max}`
      }
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(String(value))) {
      return `${rule.field} does not match the required pattern`
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value, data)
      if (customError) {
        return customError
      }
    }

    return null
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }
}

export function transformBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  const str = String(value).toLowerCase()
  return ['true', '1', 'yes', 'y'].includes(str)
}

export function transformDate(value: any): Date {
  if (value instanceof Date) return value
  return new Date(value)
}

export function transformNumber(value: any): number {
  return Number(value)
}

export function transformSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}