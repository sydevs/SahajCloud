import type { CollectionConfig, GlobalConfig, Plugin } from 'payload'

import { appendDocumentControl } from '@/lib/admin/documentControls'

export const LIVE_PREVIEW_NOTICE = '@/components/admin/LivePreviewNotice'

/**
 * How an entity says its preview page runs no live-preview subscriber, and so
 * answers Payload's handshake with nothing. Declared beside `livePreview`.
 */
export const LIVE_PREVIEW_SUBSCRIBES = 'livePreviewSubscribes'

/**
 * Whether a silent panel for this entity means anything.
 *
 * ⚠ **Opt-out, never opt-in.** A new preview surface is covered by declaring
 * nothing; what needs declaring is the consumer that was never wired, which is
 * knowledge the entity's own config has and no panel URL carries.
 */
const watched = (entity: CollectionConfig | GlobalConfig): boolean =>
  Boolean(entity.admin?.livePreview) &&
  (entity.admin?.custom as Record<string, unknown> | undefined)?.[LIVE_PREVIEW_SUBSCRIBES] !== false

/**
 * Gives every live-preview surface the notice that says why its panel is blank.
 *
 * The document controls are the one slot every such entity has: they render
 * inside `LivePreviewProvider` (`@payloadcms/next/dist/views/Document`), so the
 * notice reads the panel's own state with no field to mount — and `pages`,
 * `lectures`, `events` and `regions` declare no `previewTargetField` to hang
 * one on.
 */
export const previewNoticePlugin: Plugin = (config) =>
  appendDocumentControl(config, {
    collections: watched,
    component: LIVE_PREVIEW_NOTICE,
    globals: watched,
  })
