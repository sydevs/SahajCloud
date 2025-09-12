'use client'

import React from 'react'
import type { KeyframeData } from '../types'
import type { Narrator } from '@/payload-types'
import { InstructionsPanel as StyledInstructionsPanel, InstructionsTitle } from '../styled'
import { formatTime } from '../utils'

interface InstructionsPanelProps {
  narrator: Narrator | null
  currentTime: number
  frames: KeyframeData[]
}

const InstructionsPanel: React.FC<InstructionsPanelProps> = ({ narrator, currentTime, frames }) => {
  return (
    <>
      {/* Instructions */}
      {narrator && (
        <StyledInstructionsPanel>
          <InstructionsTitle>📍 Quick Instructions</InstructionsTitle>
          Click any frame to add it at the current audio time ({formatTime(Math.round(currentTime))}
          )
          {frames.length === 0 && (
            <>
              <br />
              <span style={{ fontWeight: '500', color: 'var(--theme-success-400)' }}>
                Your first frame will be set to 0 seconds
              </span>
            </>
          )}
          <div style={{ lineHeight: '1.5em', marginTop: '0.5em' }}>
            <strong>Keyboard Shortcuts:</strong>
            <br />
            {' SPACE to play/pause; ←→Arrows for ±5s'}
          </div>
        </StyledInstructionsPanel>
      )}
    </>
  )
}

export default InstructionsPanel
