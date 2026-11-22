/**
 * @vitest-environment jsdom
 *
 * `NeedHelpButton` — the header's support link, portalled beside the locale
 * select. A DOM is needed because the behaviour is what it does to a node it
 * does not own: it mounts into Payload's `.app-header`, publishes its width
 * there for `custom.scss`, and must take that width back on unmount, or the
 * locale select stays shifted on a header with no button.
 *
 * The stand-in for `@payloadcms/ui`'s `Button` reproduces only `el="anchor"`,
 * which renders an `<a href={url}>` (`dist/elements/Button/index.js`). jsdom has
 * no layout and no `ResizeObserver`, so `offsetWidth` and the observer are
 * stubbed.
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, url }: { children: ReactNode; url: string }) =>
    createElement('a', { href: url }, children),
}))

import { NeedHelpButton } from '@/components/admin/NeedHelpButton/NeedHelpButton'
import { CONTACT_EMAIL } from '@/lib/contact'

const WIDTH = 96

describe('NeedHelpButton', () => {
  let header: HTMLElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(WIDTH)

    header = document.createElement('header')
    header.className = 'app-header'
    const actions = document.createElement('div')
    header.appendChild(actions)
    document.body.appendChild(header)
    root = createRoot(actions)
    act(() => root.render(createElement(NeedHelpButton)))
  })

  afterEach(() => {
    header.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('mounts a mailto to the support address directly in the header', () => {
    const help = header.querySelector(':scope > .need-help')
    expect(help?.querySelector('a')?.getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
    expect(header.style.getPropertyValue('--need-help-width')).toBe(`${WIDTH}px`)
  })

  it('takes its width back from the header on unmount', () => {
    act(() => root.unmount())

    expect(header.querySelector('.need-help')).toBeNull()
    expect(header.style.getPropertyValue('--need-help-width')).toBe('')
  })
})
