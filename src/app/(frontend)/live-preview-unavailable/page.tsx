import React from 'react'

/**
 * What the Live Preview panel shows when a document has no URL to point at.
 *
 * ## Why a page, and not `null`
 *
 * Returning `null` from `admin.livePreview.url` does more than leave the panel
 * blank. `setLivePreviewURL` calls `setIsLivePreviewing(false)`, and an effect
 * then **persists `editViewType: 'default'` as that editor's preference** — so
 * live preview is off the next time they open *any* document of that
 * collection, and they have to find the eye icon again. On a first render a
 * falsy URL hides the toggle entirely, with no explanation at all.
 *
 * That matters most where it is most confusing. `pages` autosaves every 60
 * seconds and the URL re-resolves on each save, so an editor who clears the
 * slug field to retype it can lose the panel — and their stored preference —
 * mid-edit, with nothing on screen saying why.
 *
 * ## Why it is hosted here
 *
 * Same origin as the admin, so the CSP `frame-src` already allows it
 * (`'self'`), and a consumer site never has to carry a route whose only job is
 * to explain a CMS-side problem.
 */

/** Explanations, keyed by the `reason` the URL builder passed. */
const REASONS: Record<string, { title: string; body: string }> = {
  'no-key': {
    title: 'Live preview is not configured',
    body: 'This environment has no live-preview signing key, so preview links cannot be issued. Set LIVE_PREVIEW_SIGNING_KEY on the service to enable it.',
  },
  'no-path': {
    title: 'This document has no address yet',
    body: 'Live preview opens the page this document will be published at, and that address cannot be worked out yet. Fill in the fields it is built from — usually the slug — then save.',
  },
  'no-region': {
    title: 'This event has no region yet',
    body: 'An event is previewed on its region’s map, so it needs one before there is anywhere to show it. Choose a region under Location, then save.',
  },
}

const FALLBACK = {
  title: 'Live preview is not available',
  body: 'There is no page to preview for this document yet.',
}

export default async function LivePreviewUnavailablePage(props: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await props.searchParams
  const { title, body } = (reason && REASONS[reason]) || FALLBACK

  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>{title}</h1>
        <p style={{ lineHeight: 1.6, opacity: 0.75 }}>{body}</p>
      </div>
    </div>
  )
}
