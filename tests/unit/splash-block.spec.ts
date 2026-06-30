import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { SplashBlock } from '@/lib/richEditor/blocks/SplashBlock'

/**
 * The WeMeditate web app overlays the site header on a page's lead Splash block
 * and themes it from `splash.textColor` (light text ⇒ dark hero ⇒ dark header,
 * and vice-versa). The field name and its `'dark' | 'light'` values are a
 * cross-repo contract, so this guards them against accidental rename/removal.
 * See issue #516.
 */
describe('SplashBlock textColor field', () => {
  const textColor = SplashBlock.fields.find(
    (field): field is SelectField => field.type === 'select' && field.name === 'textColor',
  )

  it('is a select field defaulting to dark', () => {
    expect(textColor).toBeDefined()
    expect(textColor?.defaultValue).toBe('dark')
  })

  it('offers exactly the dark and light options the web app expects', () => {
    const values = textColor?.options?.map((option) =>
      typeof option === 'string' ? option : option.value,
    )
    // Order-independent: the web-app contract is the set of values, not their
    // dropdown order. Set equality still fails if a value is missing or added.
    expect(new Set(values)).toEqual(new Set(['dark', 'light']))
  })

  it('stays optional so existing splash blocks remain valid (web app defaults to dark when absent)', () => {
    expect(textColor?.required).toBeFalsy()
  })
})
