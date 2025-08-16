'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@payloadcms/ui'
import MeditationFrameEditorModal from './MeditationFrameEditorModal'
import type { MeditationFrameEditorProps, FrameData } from './types'
import type { Narrator } from '@/payload-types'

const MeditationFrameEditor: React.FC<MeditationFrameEditorProps> = ({
  path,
  label,
  description,
  required,
  readOnly,
}) => {
  const { value, setValue } = useField<FrameData[]>({ path })
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [narrator, setNarrator] = useState<Narrator | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get the meditation's audio file and narrator from sibling fields
  const audioField = useField<string>({ path: 'filename' })
  const narratorField = useField<string>({ path: 'narrator' })

  useEffect(() => {
    const loadMeditationData = async () => {
      try {
        setIsLoading(true)
        
        // Get audio URL from the meditation's upload field
        if (audioField.value) {
          // In Payload, uploaded files have their URL accessible via the filename
          // Use the current window location to get the correct port in development
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
          setAudioUrl(`${baseUrl}/media/meditations/${audioField.value}`)
        }

        // Load narrator data if narrator ID is available
        if (narratorField.value && typeof window !== 'undefined') {
          try {
            const response = await fetch(`/api/narrators/${narratorField.value}`)
            if (response.ok) {
              const narratorData = await response.json()
              setNarrator(narratorData)
            }
          } catch (error) {
            console.error('Failed to load narrator data:', error)
          }
        }
      } catch (error) {
        console.error('Failed to load meditation data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMeditationData()
  }, [audioField.value, narratorField.value])

  // Initialize empty array if no value exists
  const frames = value || []

  const handleSave = (newFrames: FrameData[]) => {
    // Sort frames by timestamp before saving
    const sortedFrames = [...newFrames].sort((a, b) => a.timestamp - b.timestamp)
    setValue(sortedFrames)
  }

  if (isLoading) {
    return (
      <div className="field-type">
        <label className="field-label">
          {label || 'Meditation Video'}
          {required && <span className="required">*</span>}
        </label>
        {description && <div className="field-description">{description}</div>}
        <div className="meditation-frame-editor loading">
          <div className="loading-message">Loading meditation data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="field-type">
      <label className="field-label">
        {label || 'Meditation Video'}
        {required && <span className="required">*</span>}
      </label>
      {description && <div className="field-description">{description}</div>}
      
      <MeditationFrameEditorModal
        initialFrames={frames}
        audioUrl={audioUrl}
        narrator={narrator}
        onSave={handleSave}
        readOnly={readOnly}
      />
    </div>
  )
}

export default MeditationFrameEditor