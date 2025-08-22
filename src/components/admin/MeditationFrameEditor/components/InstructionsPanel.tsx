'use client'

import React from 'react'
import type { FrameData } from '../types'
import type { Narrator } from '@/payload-types'
import { InstructionsPanel as StyledInstructionsPanel, InstructionsTitle } from '../styled'

interface InstructionsPanelProps {
  narrator: Narrator | null
  currentTime: number
  frames: FrameData[]
}

const InstructionsPanel: React.FC<InstructionsPanelProps> = ({ narrator, currentTime, frames }) => {
  return (
    <>
      {/* Instructions */}
      {narrator && (
        <StyledInstructionsPanel>
          <InstructionsTitle>📍 Quick Instructions</InstructionsTitle>
          Click any frame to add it at the current audio time ({Math.round(currentTime)}s)
          {frames.length === 0 && (
            <>
              <br />
              <span style={{ fontWeight: '500', color: 'var(--theme-success-400)' }}>
                Your first frame will be set to 0 seconds
              </span>
            </>
          )}
        </StyledInstructionsPanel>
      )}
    </>
  )
}

export default InstructionsPanel
