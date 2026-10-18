/**
 * `convertTextbox`'s `textColor` mapping — the one field of a legacy WeMeditate
 * textbox whose two branches once disagreed about the same input (#975).
 *
 * `textColor` names the TEXT, so `'light'` means light text over a dark
 * background and a consumer inverts it to theme the background (#516, PR #519).
 *
 * Fixture pre-mortem: a legacy textbox carries `data.type`, `data.color`,
 * `data.background` and an `image.preview` URL that keys `context.mediaMap`.
 * Verified against `seeds/wemeditate/data.json` — 1,077 textbox blocks, of which
 * 37 `splash` (all `color: 'light'`), 570 `image`, 470 `text` — and against the
 * `mediaMap.get(data.image.preview)` lookup in `convertTextbox` itself.
 */

import type { ConversionContext, EditorJSBlock } from '../../seeds/lib/lexicalConverter'
import type { Logger } from '../../seeds/lib/logger'
import type { Payload } from 'payload'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi } from 'vitest'

import { convertTextbox } from '../../seeds/lib/lexicalConverter'

const IMAGE_URL =
  'https://storage.googleapis.com/wemeditate/uploads/media_file/file/205/small_background.jpg'

function makeContext(): ConversionContext {
  return {
    payload: {} as Payload,
    logger: {
      warn: vi.fn(),
      skip: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    } as unknown as Logger,
    pageId: 42,
    pageTitle: 'Test Page',
    locale: 'en',
    mediaMap: new Map([[IMAGE_URL, 205]]),
    formMap: new Map(),
    lectureMap: new Map(),
    treatmentMap: new Map(),
    treatmentThumbnailMap: new Map(),
    meditationTitleMap: new Map(),
    meditationRailsTitleMap: new Map(),
  }
}

/** The TextBoxBlock fields `convertTextbox` emits for one legacy block. */
function convert(data: Record<string, unknown>) {
  const block: EditorJSBlock = {
    type: 'textbox',
    data: { title: 'Meditation', image: { id: 205, preview: IMAGE_URL }, ...data },
  }
  const result = convertTextbox(block, makeContext())
  expect(result).not.toBeNull()
  return result!.fields
}

describe('convertTextbox textColor', () => {
  // A splash is text over a full-bleed image, so both colour states give light
  // text. All 37 splash blocks in the seed data carry `color: 'light'`.
  it.each(['light', 'dark'])('gives a splash light text when color is %s', (color) => {
    expect(convert({ type: 'splash', background: 'white', color })).toMatchObject({
      imagePosition: 'overlay',
      textPosition: 'left',
      textColor: 'light',
    })
  })

  // An image overlay inverts the legacy field: the editor's `color` names the
  // background there, so the text takes the opposite value.
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

  // Side-by-side has no overlay, so the page background shows through and the
  // text is dark whatever the legacy field says.
  it.each(['light', 'dark'])('gives a side-by-side image dark text when color is %s', (color) => {
    expect(convert({ type: 'image', background: 'white', color, position: 'right' })).toMatchObject(
      { imagePosition: 'right', textPosition: 'left', textColor: 'dark' },
    )
  })

  it('preserves the legacy color in importData, whichever branch ran', () => {
    expect(
      convert({ type: 'splash', background: 'white', color: 'light' }).importData,
    ).toMatchObject({ background: 'white', color: 'light' })
  })
})

/**
 * The behaviour above cannot catch the defect coming back: the arms of
 * `data.color === 'dark' ? 'light' : 'light'` are equal, so restoring it changes
 * no output. This is what fails instead.
 */
describe('the splash branch reads no field it discards', () => {
  it('decides textColor without consulting data.color', () => {
    const source = readFileSync(resolve(__dirname, '../../seeds/lib/lexicalConverter.ts'), 'utf8')
    const splashBranch = source.slice(
      source.indexOf("if (data.type === 'splash') {"),
      source.indexOf("} else if (data.type === 'image') {"),
    )

    expect(splashBranch).toContain("textColor = 'light'")
    expect(splashBranch).not.toContain('data.color')
  })
})
