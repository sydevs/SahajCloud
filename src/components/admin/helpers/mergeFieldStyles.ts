import type { CSSProperties } from 'react'

/**
 * A custom field's `admin.style` and `admin.width`, merged the way Payload
 * merges a built-in field's: `admin.width` becomes `--field-width`, which
 * Payload's own `.field-type` SCSS consumes, and a field without one flexes
 * so it fills its slot in a row.
 *
 * ⚠ Payload's own `mergeFieldStyles` is not in `@payloadcms/ui`'s exports, and
 * the package is prebundled, so a deep import would load a second copy of its
 * contexts. A custom field that merges nothing is content-width while the
 * built-ins beside it flex, and nothing in the field's own config says so.
 */
export function mergeFieldStyles(
  admin: { style?: CSSProperties; width?: CSSProperties['width'] } | undefined,
): CSSProperties {
  const { style, width } = admin ?? {}
  return {
    ...style,
    ...(width ? { '--field-width': width } : { flex: '1 1 auto' }),
    // A flex the field itself declares still outranks the fallback above.
    ...(style?.flex ? { flex: style.flex } : {}),
  } as CSSProperties
}
