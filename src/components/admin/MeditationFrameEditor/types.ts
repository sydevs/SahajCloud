import type { Frame } from '@/payload-types'

// Types that are not defined in payload-types.ts
export type KeyframeData = {
  timestamp: number
} & Partial<Frame>

export interface AudioPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  isLoaded: boolean
  isLoading: boolean
}

export interface MeditationFrameEditorProps {
  path: string
  label?: string
  description?: string
  required?: boolean
  readOnly?: boolean
}
