import type { TextField, TextFieldSingleValidation } from 'payload'

export type UrlFieldOptions = {
  /** Allowed URL protocols (default: ['http:', 'https:']) */
  protocols?: string[]
} & Omit<TextField, 'type' | 'hasMany' | 'maxRows' | 'minRows'>

/**
 * Creates a standardized URL field with built-in validation
 * for proper URL format and protocol checking
 */
export function urlField(options: UrlFieldOptions): TextField {
  const protocols = options.protocols || ['http:', 'https:']

  return {
    ...options,
    // A built URL field is `type: 'text'`, so nothing downstream can tell one
    // apart from free text — and the proposal content scan has to, or it reads
    // a legitimate link as spam (#920). Top-level `custom` and not
    // `admin.custom`: Payload strips this from the client field config, and the
    // only reader is server-side.
    custom: { ...options.custom, holdsUrl: true },
    hasMany: false,
    type: 'text',
    validate: ((value) => {
      if (!value) return true // Required validation will handle empty values

      // Ensure value is a string
      if (typeof value !== 'string') return true

      try {
        const url = new URL(value)
        // Check for valid protocols
        if (!protocols.includes(url.protocol)) {
          const protocolList = protocols.map((p) => p.replace(':', '://')).join(' or ')
          return `URL must start with ${protocolList}`
        }
        return true
      } catch {
        return 'Please enter a valid URL'
      }
    }) as TextFieldSingleValidation,
  }
}
