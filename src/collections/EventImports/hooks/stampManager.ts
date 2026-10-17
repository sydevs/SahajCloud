import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Stamps the creating manager onto `manager`, which is this collection's whole
 * access story (see `EventImports.ts`).
 *
 * The matching refusal — only a manager may create a batch — is a create rule,
 * so it lives in `src/plugins/access/accessConfigs.ts` rather than here. What
 * is left is the value write, which access control cannot do: it answers with a
 * boolean or a query, never `manager = req.user.id`.
 *
 * ⚠ **A caller with no manager leaves the field blank, and `required` refuses
 * the save.** That is the only path left here, because it is the one access
 * control does not see: a script or job creating with `overrideAccess: true`.
 * Such a caller naming its own `manager` is honoured.
 */
export const stampManager: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (req.user?.collection !== 'managers') return data

  return { ...data, manager: req.user.id }
}
