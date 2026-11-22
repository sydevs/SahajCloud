/**
 * @vitest-environment jsdom
 *
 * The two controls of the frame editor a mouse was the only way to reach
 * (#1221). A frame card was a `<div onClick>` with no role and no key handler,
 * and it is the only way to add a frame to a meditation at all; a managed row
 * seeks the live preview from a click on the row, which holds an input and a
 * remove button and so can never be a control itself.
 *
 * Both fixes are markup — a native `<button>`, which is what carries tab order,
 * Enter, Space and Payload's own focus ring — so the assertions are on the
 * rendered element rather than on a key event. jsdom runs no default activation
 * behaviour, so dispatching Enter at a button here would pass against a `<div>`
 * too, and prove nothing.
 *
 * The stand-ins reproduce only what each component reads: `useField` per path,
 * the playhead, and the seek the preview iframe receives. Nothing asserted here
 * is Payload's.
 */
import type { JSONFieldClient, UIFieldClient } from 'payload'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stub = vi.hoisted(() => ({
  /** Form state, by the path each `useField` names. */
  fields: {} as Record<string, unknown>,
  setValue: vi.fn(),
  /** The live preview's playhead, in seconds. */
  playbackTime: 0,
  seek: vi.fn(),
  available: [] as Frame[],
}))

vi.mock('@payloadcms/ui', () => ({
  FieldDescription: () => null,
  FieldError: () => null,
  Pill: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
  useField: ({ path }: { path?: string } = {}) => ({
    setValue: stub.setValue,
    showError: false,
    value: path ? stub.fields[path] : stub.fields.frames,
  }),
}))

vi.mock('@/components/admin/helpers/livePreviewPlayback', () => ({
  usePlaybackTime: () => stub.playbackTime,
  useSeekToTime: () => stub.seek,
}))

vi.mock('@/components/admin/FrameEditor/hooks', () => ({
  useAvailableFrames: () => ({
    error: null,
    frames: stub.available,
    isError: false,
    isLoading: false,
  }),
}))

// `vi.mock` is hoisted above these, so each component sees the stand-ins.
import FrameInserter from '@/components/admin/FrameEditor/FrameInserter'
import FrameListManager from '@/components/admin/FrameEditor/FrameListManager'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

const HEART = { id: 7, imageSet: 'male', label: 'Bandhan', tags: ['hand'] } as Frame

let container: HTMLDivElement
let root: Root

const render = (node: Parameters<Root['render']>[0]) => {
  container = document.createElement('div')
  document.body.replaceChildren(container)
  root = createRoot(container)
  act(() => {
    root.render(node)
  })
}

beforeEach(() => {
  stub.fields = {}
  stub.playbackTime = 0
  stub.available = []
  stub.setValue.mockReset()
  stub.seek.mockReset()
})

describe('FrameInserter', () => {
  beforeEach(() => {
    stub.available = [HEART]
    stub.fields = { frames: [{ id: 3, timestamp: 0 }] as KeyframeData[], narrator: '1' }
    stub.playbackTime = 90
    render(createElement(FrameInserter, { field: {} as UIFieldClient } as never))
  })

  it('offers each frame as a named button', () => {
    const cards = [...container.querySelectorAll('button')]
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe('button')
    expect(cards[0].ariaLabel).toBe('Insert Bandhan at 1:30')
  })

  it('still inserts the frame when that button is activated', () => {
    act(() => {
      container.querySelector('button')?.click()
    })
    expect(stub.setValue).toHaveBeenCalledWith([
      { id: 3, timestamp: 0 },
      { ...HEART, timestamp: 90 },
    ])
  })
})

describe('FrameListManager', () => {
  beforeEach(() => {
    stub.fields = { frames: [{ id: 7, label: 'Bandhan', timestamp: 90 }] as KeyframeData[] }
    render(
      createElement(FrameListManager, {
        field: { name: 'frames', type: 'json' } as JSONFieldClient,
      } as never),
    )
  })

  it('gives the row a seek control of its own, named for its frame', () => {
    // The remove button is the row's other one, and was always reachable.
    const [seek, remove] = [...container.querySelectorAll('button')]
    expect(remove.title).toBe('Remove frame')
    expect(seek.type).toBe('button')
    expect(seek.ariaLabel).toBe('Seek preview to 1:30')
  })

  it('seeks the preview to that frame when it is activated', () => {
    act(() => {
      container.querySelector('button')?.click()
    })
    expect(stub.seek).toHaveBeenCalledWith(90)
  })
})
