import type { CSSProperties } from 'react'

export const sectionCardStyle: CSSProperties = {
  marginBottom: 'calc(var(--base) * 0.5)',
}

export const headerWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'calc(var(--base) * 0.5)',
  width: '100%',
}

export const headerContentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
}

export const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'calc(var(--base) * 0.35)',
  flexWrap: 'nowrap',
}

export const tooltipStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.45)',
  background: 'var(--theme-elevation-900)',
  color: 'var(--theme-elevation-0)',
  fontSize: 'calc(var(--base-body-size) * 0.85px)',
  borderRadius: 'var(--style-radius-s)',
  whiteSpace: 'nowrap',
  zIndex: 20,
  pointerEvents: 'none',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
}

export const headerTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '1.25em',
  lineHeight: 1.3,
}

export const groupTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '1em',
  lineHeight: 1.3,
}

export const headerIndexStyle: CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontWeight: 700,
  marginRight: 'calc(var(--base) * 0.35)',
}

export const headerInlineDescStyle: CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontWeight: 400,
  fontSize: 'calc(var(--base-body-size) * 0.9px)',
}

export const headerLinkStyle: CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 0.9px)',
  textDecoration: 'underline',
  color: 'var(--theme-elevation-700)',
}

export const groupDescriptionStyle: CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontSize: 'calc(var(--base-body-size) * 0.9px)',
  marginBottom: 'calc(var(--base) * 0.4)',
}

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: 'calc(var(--base-body-size) * 1px)',
}

export const tableHeaderCellStyle: CSSProperties = {
  textAlign: 'left',
  padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.4)',
  borderBottom: '1px solid var(--theme-elevation-100)',
  color: 'var(--theme-elevation-600)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
}

export const tableCheckHeaderCellStyle: CSSProperties = {
  ...tableHeaderCellStyle,
  textAlign: 'center',
  position: 'relative',
}

export const tableRowCellStyle: CSSProperties = {
  padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.4)',
  borderBottom: '1px solid var(--theme-elevation-50)',
  verticalAlign: 'middle',
}

export const tableCheckCellStyle: CSSProperties = {
  ...tableRowCellStyle,
  textAlign: 'center',
}

export const linkRowStyle: CSSProperties = {
  color: 'var(--theme-elevation-900)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}

export const aggregateBodyStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'calc(var(--base) * 0.5)',
  padding: 'calc(var(--base) * 0.4) 0',
}

export const aggregateValueStyle: CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 1.2px)',
  fontWeight: 600,
}

export const erroredBannerStyle: CSSProperties = {
  padding: 'calc(var(--base) * 0.5)',
  background: 'var(--theme-error-50, rgba(220, 38, 38, 0.08))',
  color: 'var(--theme-error-700, #b91c1c)',
  border: '1px solid var(--theme-error-200, rgba(220, 38, 38, 0.3))',
  borderRadius: 'var(--style-radius-s)',
  fontSize: 'calc(var(--base-body-size) * 0.95px)',
}

export const emptyGroupStyle: CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  padding: 'calc(var(--base) * 0.4) 0',
}
