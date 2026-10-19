/**
 * Unit tests for convertVimeo — the EditorJS-block → Lexical-relationship
 * converter that wemeditate / storyblok importers use to retarget legacy
 * Vimeo embeds at the lectures collection.
 *
 * Pure-function lane: no Payload bootstrap. The context comes from
 * `tests/utils/conversionContext.ts`, whose logger is spied so a spec can assert
 * what a miss warned about.
 */

import type { EditorJSBlock } from '../../seeds/lib/lexicalConverter'

import { describe, it, expect, vi } from 'vitest'

import { convertVimeo } from '../../seeds/lib/lexicalConverter'
import { makeConversionContext } from '../utils/conversionContext'

describe('convertVimeo', () => {
  it('emits a lectures relationship node when the nested vimeo_id is mapped', () => {
    // Wemeditate's actual block shape: data.items[].vimeo_id (verified in source data)
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ vimeo_id: '397267913', title: 'Our Volunteers' }] },
    }
    const context = makeConversionContext({
      lectureMap: new Map([['397267913', 1234]]),
    })

    const result = convertVimeo(block, context)

    expect(result).toEqual({
      type: 'relationship',
      version: 2,
      relationTo: 'lectures',
      value: 1234,
    })
    expect(context.logger.warn).not.toHaveBeenCalled()
  })

  it('also handles the flat data.vimeo_id shape (storyblok / hand-authored)', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { vimeo_id: '999', title: 'Flat shape' },
    }
    const context = makeConversionContext({
      lectureMap: new Map([['999', 'lecture-id-string']]),
    })

    const result = convertVimeo(block, context)

    expect(result).toMatchObject({
      type: 'relationship',
      relationTo: 'lectures',
      value: 'lecture-id-string',
    })
  })

  it('returns null and logs a missing-lecture warning when vimeo_id is absent from the map', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ vimeo_id: 'unknown-id' }] },
    }
    const context = makeConversionContext({ lectureMap: new Map() })

    const result = convertVimeo(block, context)

    expect(result).toBeNull()
    expect(context.logger.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(context.logger.warn).mock.calls[0][0]).toContain('unknown-id')
  })

  it('drops youtube_id blocks with a logged warning (no NV YouTube ingest path)', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ youtube_id: 'dQw4w9WgXcQ' }] },
    }
    const context = makeConversionContext()

    const result = convertVimeo(block, context)

    expect(result).toBeNull()
    expect(context.logger.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(context.logger.warn).mock.calls[0][0]).toContain('YouTube')
  })

  it('returns null without warning when the block has neither vimeo_id nor youtube_id', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ title: 'orphaned title' }] },
    }
    const context = makeConversionContext()

    const result = convertVimeo(block, context)

    expect(result).toBeNull()
    // No lecture lookup possible → no missing-lecture warning either. This is
    // a malformed block, not a missing reference. Stay quiet.
    expect(context.logger.warn).not.toHaveBeenCalled()
  })
})
