'use client'

import type { FieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

const VariableInsert: FieldClientComponent = ({ field }) => {
  const variables = field.admin?.custom?.variables as string[] | undefined
  const { value, setValue, path } = useField<string>()
  const cursorRef = useRef<number | null>(null)
  const [pendingCursor, setPendingCursor] = useState<number | null>(null)

  // Track cursor position on the sibling text input
  useEffect(() => {
    const inputId = `field-${path.replace(/\./g, '__')}`
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (!input) return
    const track = () => {
      cursorRef.current = input.selectionStart
    }
    input.addEventListener('mouseup', track)
    input.addEventListener('keyup', track)
    input.addEventListener('select', track)
    return () => {
      input.removeEventListener('mouseup', track)
      input.removeEventListener('keyup', track)
      input.removeEventListener('select', track)
    }
  }, [path])

  // Restore cursor position after value update
  useEffect(() => {
    if (pendingCursor === null) return
    const inputId = `field-${path.replace(/\./g, '__')}`
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (input) {
      input.focus()
      input.setSelectionRange(pendingCursor, pendingCursor)
    }
    setPendingCursor(null)
  }, [value, pendingCursor, path])

  if (!variables?.length) return null

  const handleInsert = (variable: string) => {
    const token = `{${variable}}`
    const current = value ?? ''
    const pos = cursorRef.current ?? current.length
    const newValue = current.slice(0, pos) + token + current.slice(pos)
    setValue(newValue)
    setPendingCursor(pos + token.length)
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 'calc(var(--base) * 0.4)',
        marginTop: 'calc(var(--base) * 0.3)',
        flexWrap: 'wrap',
      }}
    >
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => handleInsert(v)}
          style={{
            padding: 'calc(var(--base) * 0.2) calc(var(--base) * 0.5)',
            border: '1px solid var(--theme-elevation-300)',
            borderRadius: 'var(--style-radius-s)',
            background: 'transparent',
            color: 'var(--theme-elevation-600)',
            fontSize: 'calc(var(--base-body-size) * 1px)',
            cursor: 'pointer',
          }}
        >
          {`{${v}}`}
        </button>
      ))}
    </div>
  )
}

export default VariableInsert
