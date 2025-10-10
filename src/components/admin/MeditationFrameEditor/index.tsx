'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useField, useForm } from '@payloadcms/ui'
import InlineLayout from './InlineLayout'
import type { MeditationFrameEditorProps, KeyframeData } from './types'
import type { Narrator } from '@/payload-types'
import { sortFramesByTimestamp } from './utils'
import { LoadingState, EmptyState } from './styled'

const MeditationFrameEditor: React.FC<MeditationFrameEditorProps> = ({
  path,
  label,
  description,
  required,
  readOnly,
}) => {
  const { value, setValue } = useField<KeyframeData[]>({ path })
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [narrator, setNarrator] = useState<Narrator | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get form data which includes the complete upload data with URL
  const { getData } = useForm()

  // Get the narrator field
  const narratorField = useField<string>({ path: 'narrator' })

  useEffect(() => {
    const loadMeditationData = async () => {
      try {
        setIsLoading(true)

        // Get the complete form data which includes the upload URL
        const formData = getData()

        // Get audio URL from the form data (Payload automatically includes it for uploads)
        if (formData?.url) {
          setAudioUrl(formData.url)
        } else if (formData?.filename) {
          // Fallback to constructing URL if for some reason url field is not present
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
          setAudioUrl(`${baseUrl}/media/meditations/${formData.filename}`)
        } else {
          setAudioUrl(null)
        }

        // Load narrator data if narrator ID is available
        if (narratorField.value && typeof window !== 'undefined') {
          try {
            const response = await fetch(`/api/narrators/${narratorField.value}`)
            if (response.ok) {
              const narratorData = await response.json()
              setNarrator(narratorData)
            } else {
              setNarrator(null)
            }
          } catch (error) {
            console.error('Failed to load narrator data:', error)
            setNarrator(null)
          }
        } else {
          setNarrator(null)
        }
      } catch (error) {
        console.error('Failed to load meditation data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMeditationData()
  }, [getData, narratorField.value])

  const handleFramesChange = useCallback(
    (newFrames: KeyframeData[]) => {
      setValue(sortFramesByTimestamp(newFrames))
    },
    [setValue],
  )

  // Initialize empty array if no value exists
  const frames = value || []

  if (isLoading) {
    return <LoadingState>Loading meditation data...</LoadingState>
  }

  if (!audioUrl) {
    return (
      <EmptyState>
        Please upload an audio file and save the meditation before editing the video frames.
      </EmptyState>
    )
  }

  return (
    <InlineLayout
      audioUrl={audioUrl}
      narrator={narrator}
      frames={frames}
      onFramesChange={handleFramesChange}
      readOnly={readOnly}
    />
  )
}

export default MeditationFrameEditor
