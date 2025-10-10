'use client'

import React from 'react'
import type { KeyframeData } from '../types'
import type { Narrator } from '@/payload-types'
import { InstructionsPanel as StyledInstructionsPanel } from '../styled'
import { formatTime } from '../utils'

interface InstructionsPanelProps {
  narrator: Narrator | null
  currentTime: number
  frames: KeyframeData[]
}

const InstructionsPanel: React.FC<InstructionsPanelProps> = ({ narrator, currentTime, frames }) => {
  if (!narrator) return null

  return (
    <StyledInstructionsPanel>
      <strong>📍 Instructions:</strong> Click any frame to add at {formatTime(Math.round(currentTime))}.{' '}
      {frames.length === 0 && (
        <span style={{ color: 'var(--theme-success-400)' }}>First frame → 0s.</span>
      )}{' '}
      <strong>Keys:</strong> SPACE=play/pause, ←→=±5s
    </StyledInstructionsPanel>
  )
}

export default InstructionsPanel
