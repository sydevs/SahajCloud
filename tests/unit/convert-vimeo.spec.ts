/**
 * Unit tests for convertVimeo — the EditorJS-block → Lexical-relationship converter
 * that the wemeditate / storyblok importers use to retarget legacy Vimeo embeds at
 * the post-#291 LectureClips collection.
 *
 * Pure-function lane: no Payload bootstrap. We stub a minimal ConversionContext
 * with a `Map`-backed `lectureClipMap` and a logger spy so we can assert warnings.
 */

import type { ConversionContext, EditorJSBlock } from '../../seeds/lib/lexicalConverter'
import type { Logger } from '../../seeds/lib/logger'
import type { Payload } from 'payload'

import { describe, it, expect, vi } from 'vitest'

import { convertVimeo } from '../../seeds/lib/lexicalConverter'

function makeLogger(): Logger {
  return {
    warn: vi.fn(),
    skip: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    progress: vi.fn(),
  } as unknown as Logger
}

function makeContext(overrides: Partial<ConversionContext> = {}): ConversionContext {
  return {
    payload: {} as Payload,
    logger: makeLogger(),
    pageId: 42,
    pageTitle: 'Test Page',
    locale: 'en',
    mediaMap: new Map(),
    formMap: new Map(),
    lectureClipMap: new Map(),
    treatmentMap: new Map(),
    treatmentThumbnailMap: new Map(),
    meditationTitleMap: new Map(),
    meditationRailsTitleMap: new Map(),
    ...overrides,
  }
}

describe('convertVimeo', () => {
  it('emits a lecture-clips relationship node when the nested vimeo_id is mapped', () => {
    // Wemeditate's actual block shape: data.items[].vimeo_id (verified in source data)
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ vimeo_id: '397267913', title: 'Our Volunteers' }] },
    }
    const context = makeContext({
      lectureClipMap: new Map([['397267913', 1234]]),
    })

    const result = convertVimeo(block, context)

    expect(result).toEqual({
      type: 'relationship',
      version: 2,
      relationTo: 'lecture-clips',
      value: 1234,
    })
    expect(context.logger.warn).not.toHaveBeenCalled()
  })

  it('also handles the flat data.vimeo_id shape (storyblok / hand-authored)', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { vimeo_id: '999', title: 'Flat shape' },
    }
    const context = makeContext({
      lectureClipMap: new Map([['999', 'clip-id-string']]),
    })

    const result = convertVimeo(block, context)

    expect(result).toMatchObject({
      type: 'relationship',
      relationTo: 'lecture-clips',
      value: 'clip-id-string',
    })
  })

  it('returns null and logs a missing-clip warning when vimeo_id is absent from the map', () => {
    const block: EditorJSBlock = {
      type: 'vimeo',
      data: { items: [{ vimeo_id: 'unknown-id' }] },
    }
    const context = makeContext({ lectureClipMap: new Map() })

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
    const context = makeContext()

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
    const context = makeContext()

    const result = convertVimeo(block, context)

    expect(result).toBeNull()
    // No clip lookup possible → no missing-clip warning either; this is a malformed
    // block, not a missing reference. Stay quiet.
    expect(context.logger.warn).not.toHaveBeenCalled()
  })
})
