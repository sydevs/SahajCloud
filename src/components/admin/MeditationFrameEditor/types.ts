import type { Frame } from '@/payload-types'

export type KeyframeDefinition = {
  id: string
  timestamp: number
}

// Types that are not defined in payload-types.ts
export type KeyframeData = KeyframeDefinition & Frame

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
