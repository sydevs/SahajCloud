import type { Field, TextFieldSingleValidation } from 'payload'

/**
 * Validates hex color format (#RRGGBB or #RGB)
 */
const hexColorValidation: TextFieldSingleValidation = (value) => {
  if (!value) return true // Allow empty if not required
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
  if (!hexPattern.test(value)) {
    return 'Please enter a valid hex color (e.g., #FF5733 or #F00)'
  }
  return true
}

interface ColorFieldOptions {
  name?: string
  label?: string
  required?: boolean
  admin?: {
    description?: string
    position?: 'sidebar'
  }
}

/**
 * Creates a color field with hex validation and a custom color picker component.
 * Returns fields array to match the pattern used by other field plugins.
 *
 * @example
 * ```typescript
 * fields: [
 *   ...ColorField({ name: 'color', required: true }),
 * ]
 * ```
 */
export const ColorField = (options: ColorFieldOptions = {}): Field[] => {
  const { name = 'color', label = 'Color', required = false, admin = {} } = options

  const colorField: Field = {
    name,
    label,
    type: 'text',
    required,
    validate: hexColorValidation,
    defaultValue: '#000000',
    admin: {
      description: admin.description || 'Hex color code (e.g., #FF5733)',
      position: admin.position,
      components: {
        Field: '@/components/admin/ColorField',
      },
    },
  }

  return [colorField]
}
