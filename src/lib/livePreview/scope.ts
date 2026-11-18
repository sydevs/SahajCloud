/**
 * Every `scope` a panel URL of ours carries.
 *
 * A scope names which preview session a consumer is in, for one that serves
 * more than one. Both document consumers read it back and mount their
 * unsaved-edit subscriber only for an **unscoped** session (SahajAtlasWeb
 * `documentPreviewActive`, WeMeditateWeb `useDocumentPreviewActive`), so a
 * value spelled only at a call site shuts off a preview nobody meant to shut
 * off.
 */
export const PREVIEW_SCOPES = {
  atlasTranslations: 'sy-atlas-translations',
  clients: 'clients',
  wmWebConfig: 'wm-web-config',
  wmWebTranslations: 'wm-web-translations',
} as const

export type LivePreviewScope = (typeof PREVIEW_SCOPES)[keyof typeof PREVIEW_SCOPES]
