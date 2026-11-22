/**
 * @vitest-environment jsdom
 *
 * The two frame-editor controls a mouse was the only way to reach (#1221). A
 * frame card was a `<div onClick>` with no role and no key handler, and it is
 * the only way to add a frame to a meditation at all; a managed row seeks the
 * live preview from a click on the row, which holds an input and a remove
 * button and so can never be a control itself.
 *
 * Both fixes are markup — a native `<button>`, which is what carries tab order,
 * Enter, Space and Payload's own focus ring — so the assertions are on the
 * rendered element rather than on a key event. jsdom runs no default activation
 * behaviour, so dispatching Enter at a button here would pass against a `<div>`
 * too, and prove nothing.
 *
 * `livePreviewPlayback` is stubbed although it is ours, not the Payload
 * boundary: what the real hooks do with a `postMessage` is pinned by
 * `playbackTimeStore.spec.ts` and `meditation-transcript-tab.spec.ts`, and
 * re-running it here would be the second home `tests/AGENTS.md` rule 4 refuses.
 * What is left is the wiring these cases are for — which timestamp each control
 * hands over.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stub = vi.hoisted(() => ({
  /** Form state, by the path each `useField` names. */
  fields: {} as Record<string, unknown>,
  setValue: vi.fn(),
  /** The live preview's playhead, in seconds. */
  playbackTime: 0,
  seek: vi.fn(),
  available: [] as unknown[],
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
import type { KeyframeData } from '@/types/frames'

/** A frame with no subtle-system node, so `getFrameDisplayLabel` reads its label. */
const BANDHAN = { id: 7, label: 'Bandhan', tags: ['hand'] }

let container: HTMLDivElement
let root: Root

const render = (node: Parameters<Root['render']>[0]) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(node)
  })
}

/** By name, so neither case depends on how many controls the row or card grows. */
const button = (namePrefix: string) =>
  container.querySelector(`button[aria-label^="${namePrefix}"]`) as HTMLButtonElement

beforeEach(() => {
  stub.fields = {}
  stub.playbackTime = 0
  stub.available = []
  stub.setValue.mockReset()
  stub.seek.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('FrameInserter', () => {
  const mount = (readOnly?: boolean) => {
    stub.available = [BANDHAN]
    stub.fields = { frames: [{ id: 3, timestamp: 0 }] as KeyframeData[] }
    stub.playbackTime = 90
    render(createElement(FrameInserter, { field: {}, readOnly } as never))
  }

  it('offers each frame as a named button', () => {
    mount()
    expect(button('Insert').type).toBe('button')
    expect(button('Insert').ariaLabel).toBe('Insert Bandhan')
  })

  it('states the insertion point once, off every card name', () => {
    // `insertionTimestamp` moves on every playback tick, so a name carrying it
    // is re-announced each second to whoever has the card focused.
    mount()
    expect(button('Insert').ariaLabel).not.toContain('1:30')
    expect(container.textContent).toContain('Inserting at 1:30')
  })

  it('still inserts the frame at the playhead when that button is activated', () => {
    mount()
    act(() => button('Insert').click())
    expect(stub.setValue).toHaveBeenCalledWith([
      { id: 3, timestamp: 0 },
      { ...BANDHAN, timestamp: 90 },
    ])
  })

  it('disables the cards for a reader who cannot save the meditation', () => {
    // A tab stop writing a value the save will refuse is worse than a
    // mouse-only one, so the card answers `readOnly` now that it is one.
    mount(true)
    expect(button('Insert').disabled).toBe(true)
  })
})

describe('FrameListManager', () => {
  beforeEach(() => {
    stub.fields = { frames: [{ id: 7, label: 'Bandhan', timestamp: 90 }] as KeyframeData[] }
    render(createElement(FrameListManager, { field: { name: 'frames' } } as never))
  })

  it('gives the row a seek control of its own, named for its frame', () => {
    expect(button('Seek').type).toBe('button')
    expect(button('Seek').ariaLabel).toBe('Seek preview to 1:30')
  })

  it('seeks the preview to that frame when it is activated', () => {
    act(() => button('Seek').click())
    expect(stub.seek).toHaveBeenCalledWith(90)
  })
})
