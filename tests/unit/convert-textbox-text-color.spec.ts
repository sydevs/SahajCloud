/**
 * `convertTextbox`'s `textColor` mapping. The legacy `color` names the
 * BACKGROUND, so both overlay branches invert it to get the text (#975).
 *
 * `textColor` names the TEXT (#516): WeMeditateWeb's `textColorToSurface`
 * inverts it to get the surface its background paints.
 */

import type { EditorJSBlock } from '../../seeds/lib/lexicalConverter'

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
  // All 37 splash rows in the dump say `color: 'light'`, so this is what the
  // next `--update` writes for every one of them.
  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
  ])('inverts color %s to textColor %s for a splash', (color, expected) => {
    expect(convert({ type: 'splash', background: 'white', color })).toMatchObject({
      imagePosition: 'overlay',
      textPosition: 'left',
      textColor: expected,
    })
  })

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
