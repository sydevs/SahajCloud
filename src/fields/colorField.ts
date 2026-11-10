import type { Condition, Field, FieldAccess, TextFieldSingleValidation } from 'payload'

/** Validates hex color format (#RRGGBB or #RGB) */
const hexColorValidation: TextFieldSingleValidation = (value) => {
  if (!value) return true // Allow empty if not required
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
  if (!hexPattern.test(value)) {
    return 'Please enter a valid hex color (e.g., #FF5733 or #F00)'
  }
  return true
}

export interface ColorFieldOptions {
  name?: string
  label?: string
  required?: boolean
  /**
   * The colour a consumer uses while this one is unset. With one, nothing is
   * stored by default — a stored default would read as a choice — and the
   * picker shows this colour, named as the default, until someone picks
   * another.
   */
  fallback?: string
  access?: {
    create?: FieldAccess
    read?: FieldAccess
    update?: FieldAccess
  }
  admin?: {
    description?: string
    position?: 'sidebar'
    condition?: Condition
  }
}

/**
 * Creates a color field with hex validation and a custom color picker component.
 * Returns a single Field (no spread required).
 *
 * @example
 * ```typescript
 * fields: [
 *   colorField({ name: 'color', required: true }),
 * ]
 * ```
 */
export function colorField(options: ColorFieldOptions = {}): Field {
  const {
    name = 'color',
    label = 'Color',
    required = false,
    access,
    admin = {},
    fallback,
  } = options

  return {
    name,
    label,
    type: 'text',
    required,
    validate: hexColorValidation,
    ...(fallback ? {} : { defaultValue: '#000000' }),
    ...(access ? { access } : {}),
    admin: {
      description: admin.description || (fallback ? undefined : 'Hex color code (e.g., #FF5733)'),
      position: admin.position,
      ...(fallback ? { custom: { colorFallback: fallback } } : {}),
      ...(admin.condition ? { condition: admin.condition } : {}),
      components: {
        Field: '@/components/admin/ColorField/ColorField',
        Cell: '@/components/admin/ColorField/ColorCell',
      },
    },
  }
}
