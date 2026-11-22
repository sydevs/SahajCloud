import type { CSSProperties } from 'react'

// --- Shared Base Styles ---

export const baseStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.5)',
  } satisfies CSSProperties,

  emptyState: {
    padding: 'calc(var(--base) * 2)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-m)',
    border: '1px dashed var(--theme-elevation-200)',
  } satisfies CSSProperties,

  loadingState: {
    padding: 'calc(var(--base) * 1)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
  } satisfies CSSProperties,

  errorState: {
    padding: 'calc(var(--base) * 1)',
    textAlign: 'center' as const,
    color: 'var(--theme-error-500)',
    backgroundColor: 'var(--theme-error-100)',
    borderRadius: 'var(--style-radius-s)',
  } satisfies CSSProperties,

  thumbnail: {
    width: '60px',
    height: '60px',
    objectFit: 'cover' as const,
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-elevation-200)',
    flexShrink: 0,
  } satisfies CSSProperties,

  frameCategory: {
    fontSize: 'var(--admin-body-size)',
    fontWeight: 500,
    color: 'var(--theme-elevation-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,
}

// --- FrameListManager Styles ---

export const listManagerStyles = {
  frameList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.25)',
  } satisfies CSSProperties,

  frameInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } satisfies CSSProperties,

  frameTags: {
    fontSize: 'calc(var(--admin-body-size) * 0.85)',
    color: 'var(--theme-elevation-500)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,

  timestampInput: {
    width: '70px',
    padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
    fontSize: 'var(--admin-body-size)',
    textAlign: 'center' as const,
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-800)',
  } satisfies CSSProperties,
}

// --- FrameInserter Styles ---

export const inserterStyles = {
  container: {
    ...baseStyles.container,
    gap: 'calc(var(--base) * 0.75)',
  } satisfies CSSProperties,

  categoryFilters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    top: '68px', // Offset for PayloadCMS sticky header
    left: 'calc(var(--gutter-h) * -1)',
    right: 'calc(var(--gutter-h) * -1)',
    zIndex: 10,
    paddingTop: 'calc(var(--base) * 0.5)',
    paddingBottom: 'calc(var(--base) * 0.5)',
  } satisfies CSSProperties,

  filterPillElement: {
    flex: '1 1 auto',
    justifyContent: 'center',
  } satisfies CSSProperties,

  framesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(var(--base) * 0.35)',
    padding: '2px',
  } satisfies CSSProperties,

  thumbnailContainer: {
    position: 'relative' as const,
  } satisfies CSSProperties,

  frameThumbnail: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover' as const,
    display: 'block',
    backgroundColor: 'var(--theme-elevation-200)',
  } satisfies CSSProperties,

  categoryPill: {
    position: 'absolute' as const,
    bottom: '4px',
    left: '4px',
    right: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    fontSize: 'calc(var(--admin-body-size) * 0.75)',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: '4px',
    textAlign: 'center' as const,
    transition: 'opacity 0.15s ease',
  } satisfies CSSProperties,

  frameInfo: {
    padding: 'calc(var(--base) * 0.35)',
    textAlign: 'center' as const,
  } satisfies CSSProperties,

  frameTags: {
    fontSize: 'calc(var(--admin-body-size) * 0.8)',
    fontWeight: 500,
    color: 'var(--theme-elevation-700)',
  } satisfies CSSProperties,
}
