import type { Frame } from '@/payload-types'

export type KeyframeDefinition = {
  id: number | string
  timestamp: number
}

// Types that are not defined in payload-types.ts
export type KeyframeData = KeyframeDefinition & Partial<Frame>

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
