/**
 * @vitest-environment jsdom
 *
 * The three non-thumbnail custom cells select their row in a list drawer's
 * linked column (#944), and are untouched everywhere else.
 *
 * It needs a DOM for the reason `thumbnail-cell-drawer-select.spec.ts` gives:
 * which hook feeds the click is the whole property, so no extracted predicate
 * would cover it. The stand-in reproduces the one `@payloadcms/ui` behaviour
 * these cells rely on, read from `.../elements/ListDrawer/Provider.js`:
 * `ListDrawerContext` is created with `{}` as its default, so outside a drawer
 * the hook answers that, and `DrawerContent` is the one provider that sets
 * `drawerSlug` and `onSelect`.
 *
 * `RelationshipCountCell` is mounted whole, stub `payload` included, because
 * its server half composes the `href` its client half decides against.
 */
import type { JoinField } from 'payload'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed drawer context answers for the render under test. */
const drawer: { drawerSlug?: string; onSelect?: ReturnType<typeof vi.fn> } = {}

vi.mock('@payloadcms/ui', () => ({
  Pill: ({ children }: { children: unknown }) => createElement('span', null, children as never),
  useListDrawerContext: () => drawer,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, title }: { children: unknown; href: string; title?: string }) =>
    createElement('a', { href, title }, children as never),
}))

// `vi.mock` is hoisted above these imports, so every cell sees the stand-in.
import { AbuseScoreCell } from '@/components/admin/AbuseScore/AbuseScoreCell'
import { ColorCell } from '@/components/admin/ColorField/ColorCell'
import { RelationshipCountCell } from '@/components/admin/RelationshipCountCell/RelationshipCountCell'

/** An Authors row as the list view hands it to a cell. */
const row = { id: 4, name: 'Shri Mataji' }

/**
 * The `payload` prop the count cell reads, narrowed to the one path it takes:
 * `payload.collections[slug].config.labels`. Verified against
 * `src/collections/Pages/Pages.ts`, which declares no `labels`, so Payload
 * fills the pair from the slug — `extractLabel` then lowercases the plural.
 */
const payload = {
  collections: { pages: { config: { labels: { plural: 'Pages', singular: 'Page' } } } },
} as never

/** The join field `Authors.pages` declares. */
const joinField = { name: 'pages', type: 'join', collection: 'pages', on: 'author' } as JoinField

describe('custom cell row selection in a list drawer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    delete drawer.drawerSlug
    delete drawer.onSelect

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = (element: Parameters<Root['render']>[0]) => {
    act(() => {
      root.render(element)
    })
  }

  const openDrawer = () => {
    drawer.drawerSlug = 'list-drawer_1_authors'
    drawer.onSelect = vi.fn()
    return drawer.onSelect
  }

  const click = () => {
    const button = container.querySelector('button')
    expect(button, 'expected a button to click').not.toBeNull()
    act(() => {
      button?.click()
    })
  }

  const expectSelectedRow = (onSelect: ReturnType<typeof vi.fn>) => {
    expect(onSelect).toHaveBeenCalledWith({
      collectionSlug: 'authors',
      doc: row,
      docID: '4',
    })
  }

  const countCell = (props: Record<string, unknown>) =>
    createElement(RelationshipCountCell as never, {
      cellData: { docs: [{ id: 1 }, { id: 2 }], totalDocs: 2 },
      collectionSlug: 'authors',
      field: joinField,
      payload,
      rowData: row,
      ...props,
    })

  const colorCell = (props: Record<string, unknown>) =>
    createElement(ColorCell as never, {
      cellData: '#FF5733',
      collectionSlug: 'authors',
      rowData: row,
      ...props,
    })

  const abuseCell = (props: Record<string, unknown>) =>
    createElement(AbuseScoreCell as never, {
      cellData: { level: 'high', score: 42 },
      collectionSlug: 'authors',
      rowData: row,
      ...props,
    })

  describe('RelationshipCountCell', () => {
    it('selects the row from the linked column inside a drawer', () => {
      const onSelect = openDrawer()

      render(countCell({ link: true }))

      expect(container.querySelector('a')).toBeNull()
      click()
      expectSelectedRow(onSelect)
    })

    /** The count is zero far more often than not, and that row is pickable too. */
    it('selects a row whose count is zero', () => {
      const onSelect = openDrawer()

      render(countCell({ cellData: { docs: [], totalDocs: 0 }, link: true }))

      expect(container.textContent).toBe('0 pages')
      click()
      expectSelectedRow(onSelect)
    })

    it('selects from the linked column even with disableLink set', () => {
      const onSelect = openDrawer()

      render(countCell({ disableLink: true, link: true }))

      click()
      expectSelectedRow(onSelect)
    })

    it('links to the filtered list from the list view', () => {
      render(countCell({ link: true }))

      expect(container.querySelector('button')).toBeNull()
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        '/admin/collections/pages?where[author][in][]=4',
      )
      expect(container.textContent).toBe('2 pages')
    })

    it('renders no link in a list view with disableLink set', () => {
      render(countCell({ disableLink: true, link: true }))

      expect(container.querySelector('a')).toBeNull()
      expect(container.querySelector('button')).toBeNull()
      expect(container.textContent).toBe('2 pages')
    })

    it('leaves a column that is not the linked one as a link inside a drawer', () => {
      const onSelect = openDrawer()

      render(countCell({ link: false }))

      expect(container.querySelector('button')).toBeNull()
      expect(container.querySelector('a')).not.toBeNull()
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  describe('ColorCell', () => {
    it('selects the row from the linked column inside a drawer', () => {
      const onSelect = openDrawer()

      render(colorCell({ link: true }))

      click()
      expectSelectedRow(onSelect)
    })

    it('renders the swatch and no button in a list view', () => {
      render(colorCell({ link: true }))

      expect(container.querySelector('button')).toBeNull()
      expect(container.textContent).toBe('#FF5733')
    })

    it('leaves a column that is not the linked one inert inside a drawer', () => {
      const onSelect = openDrawer()

      render(colorCell({ link: false }))

      expect(container.querySelector('button')).toBeNull()
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  describe('AbuseScoreCell', () => {
    it('selects the row from the linked column inside a drawer', () => {
      const onSelect = openDrawer()

      render(abuseCell({ link: true }))

      click()
      expectSelectedRow(onSelect)
    })

    it('renders the score and no button in a list view', () => {
      render(abuseCell({ link: true }))

      expect(container.querySelector('button')).toBeNull()
      expect(container.textContent).toBe('42high')
    })

    it('leaves a column that is not the linked one inert inside a drawer', () => {
      const onSelect = openDrawer()

      render(abuseCell({ link: false }))

      expect(container.querySelector('button')).toBeNull()
      expect(onSelect).not.toHaveBeenCalled()
    })
  })
})
