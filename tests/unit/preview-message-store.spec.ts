// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPreviewMessageStore } from '@/components/admin/FrameEditor/messageStore'

const TYPE = 'test:value'
const PREVIEW = 'https://preview.example'

const store = createPreviewMessageStore<number>({
  empty: 0,
  read: (data) => (typeof data.value === 'number' ? data.value : null),
  type: TYPE,
})

const post = (origin: string, value: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { data: { type: TYPE, value }, origin }))

describe('the preview message store', () => {
  afterEach(() => store.reset())

  it('is heard from the subscribed origin and from no other', () => {
    const cb = vi.fn()
    store.subscribe(cb, PREVIEW, 7)

    post('https://evil.example', 5)
    expect(cb).not.toHaveBeenCalled()

    post(PREVIEW, 5)
    expect(cb).toHaveBeenCalledWith(5)
  })

  it('never hands one document the value of another', () => {
    // The message carries no id, so the subscriber supplies its own.
    store.subscribe(vi.fn(), PREVIEW, 7)
    post(PREVIEW, 5)

    expect(store.get(7)).toBe(5)
    expect(store.get(8)).toBe(0)
  })

  it('ignores a payload its reader refuses', () => {
    const cb = vi.fn()
    store.subscribe(cb, PREVIEW, 7)

    post(PREVIEW, 'five')

    expect(cb).not.toHaveBeenCalled()
  })
})
