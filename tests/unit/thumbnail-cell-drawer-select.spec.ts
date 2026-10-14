/**
 * @vitest-environment jsdom
 *
 * A thumbnail cell in a list drawer's linked column selects its row (#942).
 *
 * It needs a DOM because the defect is the wiring: Payload sets `onClick` to its
 * drawer's select handler only inside its own default cell
 * (`node_modules/@payloadcms/ui/dist/providers/TableColumns/RenderDefaultCell/index.js`),
 * and passes a custom `Cell` the unset `baseCellClientProps.onClick` instead
 * (`.../buildColumnState/renderCell.js`). Which hook feeds the click is the whole
 * property, so an extracted predicate would leave it untested.
 *
 * The stand-in reproduces the two `@payloadcms/ui` behaviours the component
 * relies on: `useListDrawerContext()` answers `{}` outside a drawer, because its
 * context is created with that default
 * (`.../elements/ListDrawer/Provider.js:3`) and carries `drawerSlug` plus
 * `onSelect` inside one (`:10`); and `Link` renders an anchor at `href`
 * (`.../elements/Link/index.js`, which passes `href` straight to `next/link`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed drawer context answers for the render under test. */
const drawer: { drawerSlug?: string; onSelect?: ReturnType<typeof vi.fn> } = {}

vi.mock('@payloadcms/ui', () => ({
  Link: ({ children, className, href }: { children: unknown; className?: string; href: string }) =>
    createElement('a', { className, href }, children as never),
  Thumbnail: () => createElement('span'),
  useListDrawerContext: () => drawer,
}))

// `vi.mock` is hoisted above these imports, so both cells see the stand-in.
import { BaseThumbnailCell } from '@/components/admin/ThumbnailCell/BaseThumbnailCell'
import { PreviewUrlThumbnailCell } from '@/components/admin/ThumbnailCell/PreviewUrlThumbnailCell'

/** A Files row as the list view hands it to a cell. */
const row = {
  id: 7,
  mimeType: 'audio/mpeg',
  filename: 'intro.mp3',
  url: 'https://files.example/intro.mp3',
}

describe('thumbnail cell row selection in a list drawer', () => {
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
    drawer.drawerSlug = 'list-drawer_1_files'
    drawer.onSelect = vi.fn()
    return drawer.onSelect
  }

  const click = () => {
    const button = container.querySelector('button')
    act(() => {
      button?.click()
    })
    return button
  }

  const previewUrlCell = (props: Record<string, unknown>) =>
    createElement(PreviewUrlThumbnailCell as never, {
      cellData: 'https://images.example/intro.png',
      collectionSlug: 'files',
      rowData: row,
      ...props,
    })

  it('selects the row from the linked column inside a drawer', () => {
    const onSelect = openDrawer()

    render(previewUrlCell({ link: true }))

    expect(container.querySelector('a')).toBeNull()
    expect(click()).not.toBeNull()
    expect(onSelect).toHaveBeenCalledWith({
      collectionSlug: 'files',
      doc: row,
      docID: '7',
    })
  })

  /**
   * `RelationshipThumbnailCell` passes an `onClick` that opens the related
   * document. As a drawer's linked column it must select instead, which is how
   * `RenderDefaultCell` behaves — it overwrites `propsToPass.onClick`.
   */
  it('lets the drawer select win over an onClick prop', () => {
    const onSelect = openDrawer()
    const onClick = vi.fn()

    render(
      createElement(BaseThumbnailCell, {
        collectionSlug: 'files',
        rowData: row,
        link: true,
        linkURL: '/admin/collections/files/7',
        onClick,
      }),
    )

    click()

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('links to the document from the list view', () => {
    render(previewUrlCell({ link: true }))

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/collections/files/7')
  })

  it('leaves a column that is not the linked one as a link inside a drawer', () => {
    const onSelect = openDrawer()

    render(previewUrlCell({ link: false }))

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe(row.url)
    expect(onSelect).not.toHaveBeenCalled()
  })

  /**
   * `DrawerContent` is the only provider, and it sets both, so no reachable
   * state carries a handler without a slug. The cell requires the slug anyway,
   * as `RenderDefaultCell` does — which is what keeps the list view a link if
   * Payload ever hands `onSelect` to a surface that is not a drawer.
   */
  it('links rather than selects when the context carries no drawer slug', () => {
    drawer.onSelect = vi.fn()

    render(previewUrlCell({ link: true }))

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/collections/files/7')
  })

  it('still calls an onClick prop outside a drawer', () => {
    const onClick = vi.fn()

    render(
      createElement(BaseThumbnailCell, {
        cellData: 'https://images.example/intro.png',
        collectionSlug: 'files',
        rowData: row,
        onClick,
      }),
    )

    click()

    expect(onClick).toHaveBeenCalledWith({
      cellData: 'https://images.example/intro.png',
      collectionSlug: 'files',
      rowData: row,
    })
  })
})
