import type { TextField, TextFieldValidation } from 'payload'

export type UrlFieldOptions = {
  /** Field name */
  name: string
  /** Field label */
  label?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether field should be localized */
  localized?: boolean
  /** Allowed URL protocols (default: ['http:', 'https:']) */
  protocols?: string[]
  /** Admin configuration overrides */
  admin?: Partial<TextField['admin']>
}

/**
 * Creates a standardized URL field with built-in validation
 * for proper URL format and protocol checking
 */
export function UrlField(options: UrlFieldOptions): TextField {
  const {
    name,
    label,
    required = false,
    localized = false,
    protocols = ['http:', 'https:'],
    admin = {},
  } = options

  return {
    name,
    label,
    required,
    localized,
    type: 'text',
    validate: ((value) => {
      if (!value) return true // Required validation will handle empty values

      // Ensure value is a string
      if (typeof value !== 'string') return true

      try {
        const url = new URL(value)
        // Check for valid protocols
        if (!protocols.includes(url.protocol)) {
          const protocolList = protocols
            .map((p) => p.replace(':', '://'))
            .join(' or ')
          return `URL must start with ${protocolList}`
        }
        return true
      } catch {
        return 'Please enter a valid URL'
      }
    }) as TextFieldValidation,
    admin,
  }
}