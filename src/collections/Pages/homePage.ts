import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/** The page `wm-web-config` serves at the site root, read once per request. */
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
