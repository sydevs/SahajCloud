'use client'

import React from 'react'
import { ModalHeader as StyledModalHeader, ModalTitle, ModalActions, Button } from '../styled'

interface ModalHeaderProps {
  onSave: () => void
  onCancel: () => void
}

const ModalHeader: React.FC<ModalHeaderProps> = ({ onSave, onCancel }) => {
  return (
    <StyledModalHeader>
      <ModalTitle>Create Meditation Video</ModalTitle>
      <ModalActions>
        <Button variant="cancel" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="save" onClick={onSave}>
          Save
        </Button>
      </ModalActions>
    </StyledModalHeader>
  )
}

export default ModalHeader