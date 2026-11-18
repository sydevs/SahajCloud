import type { Plugin } from 'payload'

import { appendDocumentControl } from '@/lib/admin/documentControls'

export const LIVE_PREVIEW_NOTICE = '@/components/admin/LivePreviewNotice'

/**
 * Gives every live-preview surface the notice that says why its panel is blank,
 * so a new one is covered with nothing to declare.
 *
 * The document controls are the one slot every such entity has: they render
 * inside `LivePreviewProvider` (`@payloadcms/next/dist/views/Document`), so the
 * notice reads the panel's own state with no field to mount — and `pages`,
 * `lectures`, `events` and `regions` declare no `previewTargetField` to hang
 * one on.
 */
export const previewNoticePlugin: Plugin = (config) =>
  appendDocumentControl(config, {
    collections: (collection) => Boolean(collection.admin?.livePreview),
    component: LIVE_PREVIEW_NOTICE,
    globals: (global) => Boolean(global.admin?.livePreview),
  })
