'use client'

import React from 'react'
import type { FrameData } from '../types'
import type { Narrator } from '@/payload-types'
import { 
  InstructionsPanel as StyledInstructionsPanel,
  InstructionsTitle,
  ProgressPanel,
  ProgressTitle,
  ProgressValue,
  ProgressSubtext
} from '../styled'

interface InstructionsPanelProps {
  narrator: Narrator | null
  currentTime: number
  frames: FrameData[]
}

const InstructionsPanel: React.FC<InstructionsPanelProps> = ({
  narrator,
  currentTime,
  frames,
}) => {
  return (
    <>
      {/* Instructions */}
      {narrator && (
        <StyledInstructionsPanel>
          <InstructionsTitle>
            📍 Quick Instructions
          </InstructionsTitle>
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

      {/* Frame Count Summary */}
      {frames.length > 0 && (
        <ProgressPanel>
          <ProgressTitle>
            📊 Progress
          </ProgressTitle>
          <ProgressValue>
            {frames.length} frame{frames.length !== 1 ? 's' : ''} added
          </ProgressValue>
          <ProgressSubtext>
            Longest: {Math.max(...frames.map((f) => f.timestamp))}s
          </ProgressSubtext>
        </ProgressPanel>
      )}
    </>
  )
}

export default InstructionsPanel