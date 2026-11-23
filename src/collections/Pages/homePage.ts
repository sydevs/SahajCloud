import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/**
 * The page `wm-web-config` serves at the site root, read once per request.
 *
 * Three callers ask: the slug field, which lets that one page keep `''`, and
 * the `parent` picker and validator, which refuse it as a parent. A page's own
 * address cannot sit under the root.
 */
export function homePageId(req: PayloadRequest): Promise<number | null> {
  return memoizeOnRequest(req, 'pages:homePageId', async () => {
    const { homePage } = await req.payload.findGlobal({
      slug: 'wm-web-config',
      depth: 0,
      req,
      select: { homePage: true },
    })
    return relationId(homePage)
  })
}
