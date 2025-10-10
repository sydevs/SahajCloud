export const SIZES = {
  SMALL_PREVIEW: 300,
  LARGE_PREVIEW: 320,
  FRAME_ITEM: 160,
  FRAME_THUMBNAIL: 40,
  BUTTON_SMALL: 32,
  BUTTON_LARGE: 44,
  PROGRESS_HEIGHT_SMALL: 4,
  PROGRESS_HEIGHT_LARGE: 8,
} as const

export const LIMITS = {
  MAX_TIMESTAMP: 3600,
  BATCH_SIZE: 1000,
  CLICK_ANIMATION_DURATION: 300,
  SEEK_STEP_SMALL: 5,
  SEEK_STEP_LARGE: 10,
} as const

export const KEYBOARD_SHORTCUTS = {
  SPACE: 'Space',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight', 
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  HOME: 'Home',
  END: 'End',
} as const

export const COLORS = {
  SUCCESS: 'var(--theme-success-400)',
  ERROR: 'var(--theme-error-400)',
  WARNING: 'var(--theme-warning-400)',
  PRIMARY: '#007bff',
  PRIMARY_DARK: '#0056b3',
  BORDER: 'var(--theme-border-color)',
  BG: 'var(--theme-bg)',
  TEXT: 'var(--theme-text)',
  ELEVATION_50: 'var(--theme-elevation-50)',
  ELEVATION_100: 'var(--theme-elevation-100)',
  ELEVATION_200: 'var(--theme-elevation-200)',
  ELEVATION_300: 'var(--theme-elevation-300)',
  ELEVATION_500: 'var(--theme-elevation-500)',
  ELEVATION_600: 'var(--theme-elevation-600)',
} as const

export const GRID_CONFIG = {
  FRAME_LIBRARY_COLUMNS: 'repeat(auto-fill, minmax(160px, 1fr))',
  GAP: '16px',
  GAP_SMALL: '8px',
} as const