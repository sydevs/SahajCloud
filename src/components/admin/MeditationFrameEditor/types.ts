// Types that are not defined in payload-types.ts
export interface FrameData {
  frame: string // Relationship ID to frames collection
  timestamp: number // Time in seconds
}

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