import type { Frame } from '@/payload-types'

export type KeyframeDefinition = {
  id: number | string
  timestamp: number
}

// Types that are not defined in payload-types.ts
// Using Omit to exclude id from Frame and explicitly define it as number | string
export type KeyframeData = Omit<Partial<Frame>, 'id'> & KeyframeDefinition

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
