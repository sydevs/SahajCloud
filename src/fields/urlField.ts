import type { TextField, TextFieldSingleValidation } from 'payload'

export type UrlFieldOptions = {
  /** Default `['http:', 'https:']`. */
  protocols?: string[]
} & Omit<TextField, 'type' | 'hasMany' | 'maxRows' | 'minRows'>

export function urlField(options: UrlFieldOptions): TextField {
  const protocols = options.protocols || ['http:', 'https:']

  return {
    ...options,
    // A built URL field is `type: 'text'`, so nothing downstream can tell one
    // from free text — and the proposal content scan must (#920). Top-level
    // `custom`, not `admin.custom`: the only reader is server-side.
    custom: { ...options.custom, holdsUrl: true },
    hasMany: false,
    type: 'text',
    validate: ((value) => {
      // Emptiness is `required`'s to refuse, not this validator's.
      if (!value) return true
      if (typeof value !== 'string') return true

      try {
        const url = new URL(value)
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
