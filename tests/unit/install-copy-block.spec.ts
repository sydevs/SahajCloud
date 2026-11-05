/**
 * @vitest-environment jsdom
 *
 * Every prefilled value on the Install tab has a Copy button that copies it
 * **exactly** (#1055).
 *
 * What needs a DOM is only this: that the rendered value and the copied value
 * are the same string. Both halves can drift apart silently — a `<pre>` that
 * trimmed its own whitespace, or a Copy button handed a label instead of a
 * value — and either leaves a volunteer pasting something that looks right. A
 * generated `routers.js` is 70 lines of code whose first wrong character is a
 * syntax error on somebody else's site.
 *
 * The stand-in for `CopyToClipboard` records the `value` prop, which is the one
 * behaviour the component relies on: Payload's own copies that prop verbatim
 * (`@payloadcms/ui/dist/elements/CopyToClipboard`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const copied = vi.hoisted(() => ({ values: [] as string[], shown: [] as string[] }))
vi.mock('@payloadcms/ui', () => ({
  CopyToClipboard: ({ value }: { value: string }) => {
    copied.values.push(value)
    return createElement('button', { type: 'button' }, 'Copy')
  },
  // Monaco cannot boot in jsdom; what matters is the `value` it is handed,
  // which Payload's editor renders verbatim.
  CodeEditor: ({ value }: { value: string }) => {
    copied.shown.push(value)
    return createElement('div', { 'data-editor': true })
  },
}))

const { CopyBlock } = await import('@/components/admin/InstallGuide/CopyBlock')
const { allSteps, snippetsOf, tracksFor } = await import('@/components/admin/InstallGuide/steps')

const VALUES = {
  apiKey: 'abc-123',
  prefix: 'free-classes',
  atlasUrl: '/free-classes',
  cmsUrl: 'https://cms.sahajatlas.com',
  widgetUrl: 'https://sahajatlas.com',
}

let container: HTMLElement
let root: Root

// The string a volunteer sees: the `<pre>` for a value, the editor's for code.
const shownValue = () => container.querySelector('pre')?.textContent ?? copied.shown.at(-1)

beforeEach(() => {
  copied.values = []
  copied.shown = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const render = (snippet: {
  label: string
  value: string
  kind: 'text' | 'html' | 'javascript'
}) => {
  act(() => {
    root.render(createElement(CopyBlock, { snippet }))
  })
}

describe('CopyBlock', () => {
  it('hands the Copy button the value, not the label', () => {
    render({ label: 'API key', value: 'abc-123', kind: 'text' })
    expect(copied.values).toEqual(['abc-123'])
  })

  it('renders the same string it offers to copy', () => {
    const value = 'line one\n  indented\nline three'
    render({ label: 'Page code', value, kind: 'javascript' })
    expect(shownValue()).toBe(value)
    expect(copied.values[0]).toBe(value)
  })

  it('shows the label, so a volunteer knows which box it goes in', () => {
    render({
      label: 'Server URL',
      value: 'https://sahajatlas.com/auto.js?key=abc-123',
      kind: 'text',
    })
    expect(container.textContent).toContain('Server URL')
  })
})

describe('every snippet on every track', () => {
  it('offers its own exact value to the clipboard', () => {
    // The criterion is per snippet, so this walks all of them rather than
    // trusting one representative.
    const tracks = tracksFor(VALUES)
    const snippets = Object.values(tracks).flatMap((track) => allSteps(track).flatMap(snippetsOf))
    expect(snippets.length).toBeGreaterThan(0)

    for (const snippet of snippets) {
      copied.values = []
      copied.shown = []
      render(snippet)
      expect(copied.values, snippet.label).toEqual([snippet.value])
      expect(shownValue(), snippet.label).toBe(snippet.value)
    }
  })
})
