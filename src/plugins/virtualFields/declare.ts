/** What a computed field declares about itself, under its own `custom`. */
export interface VirtualFieldCustom {
  /** The stored fields this field's `afterRead` hook reads. */
  virtualFieldInputs: readonly string[]
}

/**
 * Declare the stored fields this computed field's `afterRead` hook reads.
 *
 * `virtualFieldsPlugin` installs the hook that puts them back into an
 * include-mode `select`, so a field is selectable on its own wherever it is
 * mounted and no collection has to restate what its own fields read — which is
 * how #1084 happened.
 *
 * A function rather than a literal because `custom` is `Record<string, any>`:
 * a misspelled key there is a field that declares nothing, silently, and only
 * a caller's own co-select would be keeping it non-null.
 *
 * ⚠ **The input is returned too, so it is part of the response.** There is no
 * way to select a field for a hook alone. Name only what the hook truly reads:
 * a large column named here is paid for by every caller who selects the field
 * deriving from it.
 */
export function virtualFieldInputs(...inputs: string[]): VirtualFieldCustom {
  return { virtualFieldInputs: inputs }
}
