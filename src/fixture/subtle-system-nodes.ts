import { NODE, NODE_PAGES } from './content-ids'
import { fixture } from './types'

export default fixture(
  'subtle-system-nodes',
  NODE_PAGES.map((node) => ({
    id: NODE[node.slug],
    data: { slug: node.slug, page: node.id },
  })),
)
