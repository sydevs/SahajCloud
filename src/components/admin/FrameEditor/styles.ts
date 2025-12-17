import type { CSSProperties } from 'react'

// ============================================================================
// Shared Base Styles
// ============================================================================

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

  thumbnailContainer: {
    position: 'relative' as const,
    width: '60px',
    height: '60px',
    flexShrink: 0,
  } satisfies CSSProperties,

  videoIndicator: {
    position: 'absolute' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    color: 'white',
    fontWeight: 500,
  } satisfies CSSProperties,

  frameCategory: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontWeight: 500,
    color: 'var(--theme-elevation-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,
}

// ============================================================================
// FrameListManager Styles
// ============================================================================

export const listManagerStyles = {
  frameList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.25)',
  } satisfies CSSProperties,

  frameItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.5)',
    padding: 'calc(var(--base) * 0.5)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-s)',
    border: '1px solid var(--theme-elevation-100)',
    transition: 'border-color 0.15s ease',
  } satisfies CSSProperties,

  frameItemActive: {
    borderLeftWidth: '4px',
    borderLeftColor: 'var(--theme-success-500)',
    backgroundColor: 'var(--theme-elevation-100)',
  } satisfies CSSProperties,

  frameInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } satisfies CSSProperties,

  frameTags: {
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    color: 'var(--theme-elevation-500)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,

  timestampInput: {
    width: '70px',
    padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    textAlign: 'center' as const,
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-800)',
  } satisfies CSSProperties,

  removeButton: {
    padding: 'calc(var(--base) * 0.25)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--style-radius-s)',
    cursor: 'pointer',
    color: 'var(--theme-elevation-400)',
    transition: 'color 0.15s ease, background-color 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies CSSProperties,

  videoIndicator: {
    ...baseStyles.videoIndicator,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    padding: '6px',
  } satisfies CSSProperties,
}

// ============================================================================
// FrameInserter Styles
// ============================================================================

export const inserterStyles = {
  container: {
    ...baseStyles.container,
    gap: 'calc(var(--base) * 0.75)',
  } satisfies CSSProperties,

  categoryFilters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginBottom: 'calc(var(--base) * 0.25)',
  } satisfies CSSProperties,

  framesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(var(--base) * 0.35)',
    maxHeight: '500px',
    overflowY: 'auto' as const,
    padding: '2px',
  } satisfies CSSProperties,

  frameCard: {
    position: 'relative' as const,
    borderRadius: 'var(--style-radius-s)',
    overflow: 'hidden',
    border: '2px solid var(--theme-elevation-100)',
    backgroundColor: 'var(--theme-elevation-50)',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, transform 0.15s ease',
  } satisfies CSSProperties,

  frameCardHover: {
    borderColor: 'var(--theme-success-400)',
    transform: 'scale(1.02)',
  } satisfies CSSProperties,

  frameCardSelected: {
    borderColor: 'var(--theme-success-500)',
    transform: 'scale(1.05)',
  } satisfies CSSProperties,

  frameThumbnail: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover' as const,
    display: 'block',
    backgroundColor: 'var(--theme-elevation-200)',
  } satisfies CSSProperties,

  frameInfo: {
    padding: 'calc(var(--base) * 0.35)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--theme-elevation-100)',
  } satisfies CSSProperties,

  frameCategory: {
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    fontWeight: 500,
    color: 'var(--theme-elevation-700)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,

  videoIndicator: {
    ...baseStyles.videoIndicator,
    top: '8px',
    right: '8px',
  } satisfies CSSProperties,
}
