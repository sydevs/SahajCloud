import type { Form } from '@/payload-types'

/** One of the form-builder plugin's authored field blocks, by its discriminator. */
type FormFieldBlockType = NonNullable<Form['fields']>[number]['blockType']

/**
 * The plugin's field blocks that hold an email address a person types.
 *
 * Two owners, which is why this is not in either of them: `Forms` refuses to
 * save a form whose action needs an address and has no such block, and
 * `UserSubmissions` exempts those answers from the URL scan and checks them as
 * addresses instead (#899). A block type added to one list and not the other
 * fails silently — the save is accepted and the answer is refused.
 *
 * Typed against the generated union, so a plugin rename fails `tsc` here.
 */
export const EMAIL_FIELD_BLOCKS: readonly FormFieldBlockType[] = ['email']
