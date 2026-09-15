import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Why a document could not be given a live-preview URL.
 *
 * Each value is explained by `src/app/(frontend)/live-preview-unavailable`.
 * Adding one here without adding it there falls back to a generic message
 * rather than breaking, which is the right way round for a panel.
 */
export type LivePreviewUnavailableReason = 'no-key' | 'no-path' | 'no-region'

/**
 * The URL to point the Live Preview panel at when there is no page to show.
 *
 * ⚠ **Never return `null` from `admin.livePreview.url` instead of calling
 * this.** A falsy URL makes Payload close the panel *and* persist
 * `editViewType: 'default'` as that editor's preference, so preview is off the
 * next time they open any document of that collection. See the page's own
 * docblock for the full reasoning.
 */
export function livePreviewUnavailableUrl(reason: LivePreviewUnavailableReason): string {
  // `getServerUrl`, not `serverEnv.SAHAJCLOUD_URL` — that one is optional and
  // derives from `PORT` locally, so reading it raw yields
  // `undefined/live-preview-unavailable` on a dev machine.
  return `${getServerUrl()}/live-preview-unavailable?reason=${reason}`
}
