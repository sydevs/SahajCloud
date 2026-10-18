/**
 * `convertTextbox`'s `textColor` mapping. The splash arms once both returned
 * `'light'`, so no behaviour case here can catch that defect returning (#975).
 *
 * `textColor` names the TEXT (#516): WeMeditateWeb's `textColorToSurface`
 * inverts it to get the surface its background paints.
 */

import type { EditorJSBlock } from '../../seeds/lib/lexicalConverter'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { convertTextbox } from '../../seeds/lib/lexicalConverter'
import { makeConversionContext } from '../utils/conversionContext'

/**
 * Any `mediaMap` key does, since a textbox whose image is unmapped is skipped
 * before `textColor` is read. This one is shaped like the real thing — one of
 * the 15 URLs `seeds/wemeditate/data.json`'s splash blocks carry.
 */
const IMAGE_URL =
  'https://storage.googleapis.com/wemeditate/uploads/media_file/file/205/small_background.jpg'

const CONVERTER = resolve(__dirname, '../../seeds/lib/lexicalConverter.ts')

function convert(data: Record<string, unknown>) {
  const block: EditorJSBlock = {
    type: 'textbox',
    data: { title: 'Meditation', image: { id: 205, preview: IMAGE_URL }, ...data },
  }
  const context = makeConversionContext({ mediaMap: new Map([[IMAGE_URL, 205]]) })
  const result = convertTextbox(block, context)
  expect(result).not.toBeNull()
  return result!.fields
}

describe('convertTextbox textColor', () => {
  it.each(['light', 'dark'])('gives a splash light text when color is %s', (color) => {
    expect(convert({ type: 'splash', background: 'white', color })).toMatchObject({
      imagePosition: 'overlay',
      textPosition: 'left',
      textColor: 'light',
    })
  })

  // Pins that the branch inverts `data.color`. What that legacy field names is
  // the open question on `lexicalConverter.ts` (#975), not something to assert here.
  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
  ])('inverts color %s to textColor %s for an image overlay', (color, expected) => {
    expect(convert({ type: 'image', background: 'image', color })).toMatchObject({
      imagePosition: 'overlay',
      textPosition: 'left',
      textColor: expected,
    })
  })

  it.each(['light', 'dark'])('gives a side-by-side image dark text when color is %s', (color) => {
    expect(convert({ type: 'image', background: 'white', color, position: 'right' })).toMatchObject(
      {
        imagePosition: 'right',
        textPosition: 'left',
        textColor: 'dark',
      },
    )
  })

  it('keeps the legacy color in importData for a splash block', () => {
    expect(
      convert({ type: 'splash', background: 'white', color: 'light' }).importData,
    ).toMatchObject({ background: 'white', color: 'light' })
  })
})

describe('the splash branch reads no field it discards', () => {
  it('decides textColor without consulting data.color', () => {
    const source = readFileSync(CONVERTER, 'utf8')
    const start = source.indexOf("if (data.type === 'splash') {")
    const end = source.indexOf("} else if (data.type === 'image') {")

    // Both found, or the slice below is empty and asserts nothing.
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    // One spelling of the read, which is the one #975 is about. A destructured
    // `const { color } = data` would pass.
    expect(source.slice(start, end)).not.toContain('data.color')
  })
})
