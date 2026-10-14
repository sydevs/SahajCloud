/**
 * @vitest-environment jsdom
 *
 * `FrameCard`, the Transcript tab's frame row (#898 proposal): which actions each status offers,
 * and that each one calls the right handler. The row's logic lives in `frames.ts` / `rows.ts`
 * and has its own specs; this one covers what only a mount shows.
 *
 * Payload's components are stand-ins reproducing only what the card relies on, read from
 * `@payloadcms/ui/dist/elements`: `Button` calls `onClick`; `Pill` shows its children;
 * `Popup` shows its trigger and, on click, whatever `render({ close })` returns.
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FrameCardProps } from '@/components/admin/MeditationTranscript/FrameCard'

const popup = vi.hoisted(() => ({ closed: 0 }))

vi.mock('@payloadcms/ui', async () => {
  const { createElement: h, useState } = await import('react')
  return {
    Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
      h('button', { 'data-role': 'button', onClick, type: 'button' }, children),
    Pill: ({ children, pillStyle }: { children: ReactNode; pillStyle: string }) =>
      h('span', { 'data-pill': pillStyle }, children),
    MoreIcon: () => h('span', null, '…'),
    SwapIcon: () => h('span', null, '⇄'),
    Popup: function Popup({
      button,
      render,
    }: {
      button: ReactNode
      render: (a: { close: () => void }) => ReactNode
    }) {
      const [open, setOpen] = useState(false)
      const close = () => {
        popup.closed += 1
        setOpen(false)
      }
      return h(
        'div',
        null,
        h('button', { 'data-role': 'menu', onClick: () => setOpen(true), type: 'button' }, button),
        open ? render({ close }) : null,
      )
    },
    PopupList: {
      ButtonGroup: ({ children }: { children: ReactNode }) =>
        h('div', { 'data-role': 'menu-items' }, children),
      Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
        h('button', { 'data-role': 'menu-item', onClick, type: 'button' }, children),
    },
  }
})

vi.mock('@/components/admin/FrameEditor/FrameThumbnail', async () => {
  const { createElement: h } = await import('react')
  return { FrameThumbnail: () => h('img', { alt: 'Frame' }) }
})

const { FrameCard } = await import('@/components/admin/MeditationTranscript/FrameCard')

let container: HTMLDivElement
let root: Root
const handlers = () => ({
  onSeek: vi.fn(),
  onApprove: vi.fn(),
  onChange: vi.fn(),
  onSetAside: vi.fn(),
  onRemove: vi.fn(),
})

function mount(props: Partial<FrameCardProps> & Pick<FrameCardProps, 'status'>) {
  const all = {
    time: 90,
    name: 'Sitting in silence',
    frame: { id: 4, timestamp: 90 },
    ...handlers(),
    ...props,
  }
  act(() => root.render(createElement(FrameCard, all as FrameCardProps)))
  return all
}

const buttons = (role: string) => [
  ...container.querySelectorAll<HTMLButtonElement>(`[data-role="${role}"]`),
]
const labels = (role: string) => buttons(role).map((b) => b.textContent)
const openMenu = () => act(() => buttons('menu')[0].click())
const clickItem = (label: string) =>
  act(() =>
    buttons('menu-item')
      .find((b) => b.textContent === label)!
      .click(),
  )

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  popup.closed = 0
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('a suggestion', () => {
  it('offers Approve, with picking another frame and setting it aside in the menu', () => {
    mount({ status: 'suggested' })
    expect(labels('button')).toEqual(['Approve'])
    openMenu()
    expect(labels('menu-item')).toEqual(['Pick another frame', 'Not needed'])
  })

  it('calls approve', () => {
    const props = mount({ status: 'suggested' })
    act(() => buttons('button')[0].click())
    expect(props.onApprove).toHaveBeenCalledOnce()
  })

  it('says it keeps the current frame when it would replace one, and names that frame', () => {
    const props = mount({ status: 'suggested', replaces: { name: 'Left Channel', time: 92 } })
    expect(container.textContent).toContain('Replaces Left Channel at 1:32')
    openMenu()
    clickItem('Keep the current frame')
    expect(props.onSetAside).toHaveBeenCalledOnce()
    expect(popup.closed).toBe(1)
  })

  it('shows the reason and the Suggested pill', () => {
    mount({ status: 'suggested', reason: 'Both hands placed on the earth.' })
    expect(container.textContent).toContain('Both hands placed on the earth.')
    expect(container.querySelector('[data-pill="warning"]')?.textContent).toBe('Suggested')
  })
})

describe('a frame in the meditation', () => {
  it('has no main button and no pill, only Change and Remove in the menu', () => {
    mount({ status: 'frame' })
    expect(labels('button')).toEqual([])
    expect(container.querySelector('[data-pill]')).toBeNull()
    openMenu()
    expect(labels('menu-item')).toEqual(['Change frame', 'Remove frame'])
  })

  it('calls change and remove, closing the menu each time', () => {
    const props = mount({ status: 'frame' })
    openMenu()
    clickItem('Change frame')
    openMenu()
    clickItem('Remove frame')
    expect(props.onChange).toHaveBeenCalledOnce()
    expect(props.onRemove).toHaveBeenCalledOnce()
    expect(popup.closed).toBe(2)
  })
})

describe('an approved or changed suggestion', () => {
  it.each([
    ['approved', 'Approved'],
    ['changed', 'Changed'],
  ] as const)('%s shows a success pill reading %s', (status, label) => {
    mount({ status })
    expect(container.querySelector('[data-pill="success"]')?.textContent).toBe(label)
  })
})

describe('name and details', () => {
  it('shows the name, and the time with the tags beside it', () => {
    mount({ status: 'frame', time: 36, name: 'Both hands on the ground', details: 'earth, hands' })
    expect(container.textContent).toContain('Both hands on the ground')
    expect(container.textContent).toContain('0:36 · earth, hands')
  })
})

describe('the time', () => {
  it('plays from the frame when clicked', () => {
    const props = mount({ status: 'frame', time: 125 })
    const time = [...container.querySelectorAll('button')].find((b) => b.textContent === '2:05')!
    act(() => time.click())
    expect(props.onSeek).toHaveBeenCalledOnce()
  })
})
