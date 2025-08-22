import { useState, useEffect, useCallback } from 'react'
import type { Frame } from '@/payload-types'

interface UseFrameDetailsReturn {
  frameDetails: { [key: string]: Frame }
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export const useFrameDetails = (frameIds: string[]): UseFrameDetailsReturn => {
  const [frameDetails, setFrameDetails] = useState<{ [key: string]: Frame }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFrameDetails = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return

    const missingIds = ids.filter((id) => !frameDetails[id])
    if (missingIds.length === 0) return

    setIsLoading(true)
    setError(null)

    try {
      const promises = missingIds.map(async (id) => {
        try {
          const response = await fetch(`/api/frames/${id}`)
          if (response.ok) {
            const frame = await response.json()
            return { id, frame }
          } else {
            console.warn(`Failed to load frame ${id}: ${response.status}`)
          }
        } catch (error) {
          console.error(`Failed to load frame ${id}:`, error)
        }
        return null
      })

      const results = await Promise.all(promises)
      
      setFrameDetails(prev => {
        const newFrameDetails = { ...prev }
        results.forEach((result) => {
          if (result) {
            newFrameDetails[result.id] = result.frame
          }
        })
        return newFrameDetails
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load frame details'
      setError(errorMessage)
      console.error('Failed to load frame details:', err)
    } finally {
      setIsLoading(false)
    }
  }, [frameDetails])

  const refetch = useCallback(() => {
    // Clear cache and reload all frames
    setFrameDetails({})
    loadFrameDetails(frameIds)
  }, [frameIds, loadFrameDetails])

  useEffect(() => {
    loadFrameDetails(frameIds)
  }, [frameIds, loadFrameDetails])

  return {
    frameDetails,
    isLoading,
    error,
    refetch,
  }
}