'use client'

import { useDocumentInfo, useField, useForm } from '@payloadcms/ui'
import { useCallback, useState } from 'react'

/**
 * "Refresh from API" button displayed after the `lastRefreshed` field.
 * Calls GET /api/lectures/:id/refresh and pre-fills the form with fresh data.
 * The user must save manually to persist the changes.
 */
const RefreshLectureButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const { value: vimeoUrl } = useField<string>({ path: 'nirmalVidyaVimeoUrl' })
  const { dispatchFields } = useForm()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (!id) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(`/api/lectures/${id}/refresh`, { method: 'POST' })
      const data = (await response.json()) as {
        error?: string
        title?: string
        videoUrl?: string
        thumbnail?: number
        lastRefreshed?: string
      }

      if (!response.ok) {
        setError(data.error || `Refresh failed (HTTP ${response.status})`)
        return
      }

      // Update form fields with fresh data
      if (data.title) {
        dispatchFields({ type: 'UPDATE', path: 'title', value: data.title })
      }
      if (data.videoUrl) {
        dispatchFields({ type: 'UPDATE', path: 'videoUrl', value: data.videoUrl })
      }
      if (data.thumbnail) {
        dispatchFields({ type: 'UPDATE', path: 'thumbnail', value: data.thumbnail })
      }
      if (data.lastRefreshed) {
        dispatchFields({ type: 'UPDATE', path: 'lastRefreshed', value: data.lastRefreshed })
      }

      setSuccess(true)
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [id, dispatchFields])

  // Only show in edit mode (when document has an ID) and has a Vimeo URL
  if (!id || !vimeoUrl) return null

  return (
    <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        style={{
          padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.6)',
          fontSize: 'calc(var(--base-body-size) * 1px)',
          backgroundColor: 'var(--theme-elevation-100)',
          color: 'var(--theme-text)',
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: 'var(--style-radius-s)',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Refreshing…' : 'Refresh from API'}
      </button>

      {error && (
        <p style={{ color: 'var(--theme-error-500)', marginTop: 'calc(var(--base) * 0.3)' }}>
          {error}
        </p>
      )}
      {success && (
        <p
          style={{ color: 'var(--theme-success-500)', marginTop: 'calc(var(--base) * 0.3)' }}
        >
          Fields updated — review and save to persist.
        </p>
      )}
    </div>
  )
}

export default RefreshLectureButton
