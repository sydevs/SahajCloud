'use client'

import {
  CopyToClipboard,
  fieldBaseClass,
  toast,
  Upload,
  useAuth,
  useConfig,
  useDocumentInfo,
  useLivePreviewContext,
} from '@payloadcms/ui'
import { formatFilesize } from 'payload/shared'
import { useCallback, useRef, useState } from 'react'

const baseClass = 'file-field'
const detailsClass = 'file-details'
const metaClass = 'file-meta'

const DURATION_DIFF_THRESHOLD_SECONDS = 5

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

/**
 * Custom Upload component for the Meditations collection.
 *
 * Features:
 * - Recreates FileDetails wrapper using PayloadCMS CSS classes
 * - Composes FileMeta content + audio player INSIDE the wrapper
 * - Auto-hides when live preview is open to maximize space for frame editing
 * - Admin-only "Replace Audio" flow with duration-diff warning
 */
export default function AudioUpload() {
  const { data, id, collectionSlug } = useDocumentInfo()
  const { isLivePreviewing } = useLivePreviewContext()
  const {
    config: { serverURL },
    getEntityConfig,
  } = useConfig()
  const { user, token } = useAuth()

  // All hooks must be called unconditionally, before any early return
  const [replaceMode, setReplaceMode] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [newDuration, setNewDuration] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setNewDuration(null)

    // Read new file duration via Audio API
    const objectUrl = URL.createObjectURL(file)
    const audio = new Audio()
    audio.addEventListener('loadedmetadata', () => {
      setNewDuration(Math.round(audio.duration))
      URL.revokeObjectURL(objectUrl)
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl)
    })
    audio.src = objectUrl
  }, [])

  const handleCancel = useCallback(() => {
    setReplaceMode(false)
    setSelectedFile(null)
    setNewDuration(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleConfirmReplace = useCallback(async () => {
    if (!selectedFile || !id) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('_payload', JSON.stringify({}))
      formData.append('file', selectedFile)

      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `JWT ${token}`
      }

      const response = await fetch(`${serverURL}/api/${collectionSlug}/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { errors?: { message: string }[] }
        const message = body?.errors?.[0]?.message || `Server error ${response.status}`
        throw new Error(message)
      }

      toast.success('Audio replaced successfully')
      window.location.reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed to replace audio: ${message}`)
      setIsUploading(false)
    }
  }, [selectedFile, id, serverURL, collectionSlug, token])

  // Hide when live preview is open to maximize space for frame editing
  if (isLivePreviewing) {
    return null
  }

  // Extract file data
  const filename = data?.filename as string | undefined
  const filesize = data?.filesize as number | undefined
  const mimeType = (data?.mimeType as string | undefined) || 'audio/*'
  const virtualUrl = data?.url as string | undefined
  const audioUrl =
    virtualUrl || (filename ? `${serverURL}/api/${collectionSlug}/file/${filename}` : null)

  // No file uploaded yet - render default upload component
  if (!filename || !audioUrl) {
    if (!collectionSlug) return null

    const collectionConfig = getEntityConfig({ collectionSlug })
    const uploadConfig = collectionConfig?.upload

    if (!uploadConfig) return null

    return <Upload collectionSlug={collectionSlug} uploadConfig={uploadConfig} />
  }

  const isAdmin = user && 'type' in user && user.type === 'admin'
  const currentDuration = data?.duration as number | undefined
  const durationDiff =
    newDuration !== null && currentDuration !== undefined ? newDuration - currentDuration : null
  const hasDurationWarning =
    durationDiff !== null && Math.abs(durationDiff) > DURATION_DIFF_THRESHOLD_SECONDS

  return (
    <div className={[fieldBaseClass, baseClass].filter(Boolean).join(' ')}>
      <div className={detailsClass}>
        <header>
          <div className={`${detailsClass}__main-detail`}>
            {/* FileMeta-style content */}
            <div className={metaClass}>
              <div className={`${metaClass}__url`}>
                <a href={audioUrl} rel="noopener noreferrer" target="_blank">
                  {filename}
                </a>
                <CopyToClipboard defaultMessage="Copy URL" value={audioUrl} />
              </div>
              <div className={`${metaClass}__size-type`}>
                {filesize ? formatFilesize(filesize) : ''} - {mimeType}
                {currentDuration !== undefined && <span> — {formatSeconds(currentDuration)}</span>}
              </div>
            </div>

            {/* Audio player inside file-details - key prevents re-render resets */}
            <audio key={audioUrl} controls src={audioUrl} style={{ width: '100%', height: '40px' }}>
              Your browser does not support the audio element.
            </audio>

            {/* Replace audio section (admin only) */}
            {isAdmin && !replaceMode && (
              <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
                <button
                  type="button"
                  onClick={() => setReplaceMode(true)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--theme-elevation-200)',
                    borderRadius: 'var(--style-radius-s)',
                    color: 'var(--theme-elevation-600)',
                    cursor: 'pointer',
                    fontSize: 'calc(var(--base-body-size) * 1px)',
                    padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.6)',
                  }}
                >
                  Replace Audio
                </button>
              </div>
            )}

            {/* Inline replace mode UI */}
            {isAdmin && replaceMode && (
              <div
                style={{
                  marginTop: 'calc(var(--base) * 0.75)',
                  padding: 'calc(var(--base) * 0.75)',
                  borderRadius: 'var(--style-radius-m)',
                  border: '1px solid var(--theme-elevation-150)',
                  background: 'var(--theme-elevation-50)',
                }}
              >
                {/* Initial warning */}
                <p
                  style={{
                    margin: '0 0 calc(var(--base) * 0.5)',
                    fontSize: 'calc(var(--base-body-size) * 1px)',
                    color: 'var(--theme-elevation-800)',
                  }}
                >
                  ⚠️ Replacing the audio file may cause frame timestamps to become out of sync.
                  Please check all frame timestamps after saving.
                </p>

                {/* File picker row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'calc(var(--base) * 0.5)',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/aac,audio/ogg,audio/*"
                    onChange={handleFileSelect}
                    style={{ fontSize: 'calc(var(--base-body-size) * 1px)', flex: '1 1 auto' }}
                  />
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isUploading}
                    style={{
                      background: 'none',
                      border: '1px solid var(--theme-elevation-200)',
                      borderRadius: 'var(--style-radius-s)',
                      color: 'var(--theme-elevation-600)',
                      cursor: 'pointer',
                      fontSize: 'calc(var(--base-body-size) * 1px)',
                      padding: 'calc(var(--base) * 0.3) calc(var(--base) * 0.6)',
                    }}
                  >
                    Cancel
                  </button>
                </div>

                {/* Duration comparison (shown after file is selected) */}
                {selectedFile && (
                  <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
                    <p
                      style={{
                        margin: '0 0 calc(var(--base) * 0.3)',
                        fontSize: 'calc(var(--base-body-size) * 1px)',
                        color: 'var(--theme-elevation-700)',
                      }}
                    >
                      New file: {selectedFile.name}
                      {newDuration !== null && (
                        <span>
                          {' '}
                          — {formatSeconds(newDuration)}
                          {currentDuration !== undefined && (
                            <span style={{ color: 'var(--theme-elevation-500)' }}>
                              {' '}
                              (current: {formatSeconds(currentDuration)})
                            </span>
                          )}
                        </span>
                      )}
                    </p>

                    {/* Duration difference warning */}
                    {hasDurationWarning && durationDiff !== null && (
                      <p
                        style={{
                          margin: '0 0 calc(var(--base) * 0.5)',
                          padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
                          borderRadius: 'var(--style-radius-s)',
                          background: 'rgba(255, 165, 0, 0.12)',
                          border: '1px solid rgba(255, 165, 0, 0.4)',
                          fontSize: 'calc(var(--base-body-size) * 1px)',
                          color: 'var(--theme-elevation-800)',
                        }}
                      >
                        ⚠️ New audio is {formatSeconds(Math.abs(durationDiff))}{' '}
                        {durationDiff < 0 ? 'shorter' : 'longer'} than the current audio. Frame
                        timestamps will likely need to be adjusted.
                      </p>
                    )}

                    {/* Confirm button */}
                    <button
                      type="button"
                      onClick={handleConfirmReplace}
                      disabled={isUploading || newDuration === null}
                      style={{
                        background: 'var(--theme-success-500, #2d8a4e)',
                        border: 'none',
                        borderRadius: 'var(--style-radius-s)',
                        color: '#fff',
                        cursor: isUploading || newDuration === null ? 'not-allowed' : 'pointer',
                        fontSize: 'calc(var(--base-body-size) * 1px)',
                        opacity: isUploading || newDuration === null ? 0.6 : 1,
                        padding: 'calc(var(--base) * 0.35) calc(var(--base) * 0.8)',
                      }}
                    >
                      {isUploading ? 'Replacing…' : 'Confirm Replace'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
      </div>
    </div>
  )
}
