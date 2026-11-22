/**
 * The id a custom field's control carries, which `FieldLabel` resolves its
 * `htmlFor` to.
 *
 * On the wrapper instead, the label resolves to a `<div>`: the click focuses
 * nothing and a screen reader announces the control unnamed. A composite field
 * has no single control, so it carries this on its own root and renders no
 * `<label>` to orphan — as Payload's `Array` and `Group` do.
 *
 * ⚠ Not Payload's `generateFieldID`, which appends `-<editDepth>` above depth 1
 * while its own `TextInput` does not. Matching it here would diverge from every
 * built-in field, document drawers included (#1247).
 */
export function fieldId(path: string): string {
  return `field-${path.replace(/\./g, '__')}`
}
