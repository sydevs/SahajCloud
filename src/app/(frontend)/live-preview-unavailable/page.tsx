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
  'atlas-tab-only': {
    title: 'The preview belongs to the Atlas tab',
    body: 'There is nothing on this tab for it to show. Open the Atlas tab to see the map, and the colours and logo as a visitor will.',
  },
  'atlas-unreachable': {
    title: 'The map did not load',
    body: 'Nothing is wrong with your settings — only the preview is missing. Switch to another tab and back to try again. An ad blocker or privacy extension in this browser is the usual cause.',
  },
  'no-atlas-role': {
    title: 'This service has no atlas',
    body: 'An administrator can give this service the Sahaj Atlas role under Access. The map appears here once it has one.',
  },
  'no-classes': {
    title: 'This region has no published classes yet',
    body: 'The map shows the classes published in this service’s region, and there are none yet. Publish one under Events and it will appear here.',
  },
  'no-key': {
    title: 'Live preview is not configured',
    body: 'An administrator needs to set up live-preview signing before the preview will work here.',
  },
  'no-path': {
    title: 'This document has no address yet',
    body: 'Fill in the fields the address is built from — usually the slug — then save, and the preview opens the page this document will be published at.',
  },
  'no-region': {
    title: 'This event has no region yet',
    body: 'Choose a region under Location, then save. The preview opens on that region’s map.',
  },
  'not-reviewable': {
    title: 'There is nothing to preview here',
    body: 'This submission is not a proposal, so there is no event for the preview to show.',
  },
}

const FALLBACK = {
  title: 'Live preview is not available',
  body: 'There is no page to preview for this document yet.',
}

/** Never a URL to point a crawler at, and it is reachable unauthenticated. */
export const metadata = { robots: { index: false, follow: false } }

export default async function LivePreviewUnavailablePage(props: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await props.searchParams
  // `Object.hasOwn`, not a truthiness check: `?reason=constructor` reaches the
  // prototype chain, passes a truthy test, and destructures to two undefineds
  // — a blank page instead of the fallback.
  const { title, body } = reason && Object.hasOwn(REASONS, reason) ? REASONS[reason]! : FALLBACK

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
