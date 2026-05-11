'use client'

import type { FieldClientComponent } from 'payload'

import { Pill, useField } from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'

const VariableInsert: FieldClientComponent = ({ field }) => {
  const variables = field.admin?.custom?.variables as string[] | undefined
  const { value, setValue, path } = useField<string>()
  const cursorRef = useRef<number | null>(null)
  const pendingCursorRef = useRef<number | null>(null)

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

  // After Payload re-renders the input with the new value, restore cursor via rAF
  // so Payload's own effects don't override our setSelectionRange.
  useEffect(() => {
    const cursor = pendingCursorRef.current
    if (cursor === null) return
    const inputId = `field-${path.replace(/\./g, '__')}`
    const raf = requestAnimationFrame(() => {
      pendingCursorRef.current = null
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (!input) return
      input.focus()
      input.setSelectionRange(cursor, cursor)
    })
    return () => cancelAnimationFrame(raf)
  }, [value, path])

  if (!variables?.length) return null

  const handleInsert = (variable: string) => {
    const token = `{${variable}}`
    const current = value ?? ''
    const pos = cursorRef.current ?? current.length
    const newValue = current.slice(0, pos) + token + current.slice(pos)
    pendingCursorRef.current = pos + token.length
    setValue(newValue)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.4)',
        marginTop: 'calc(var(--base) * 0.3)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 'calc(var(--base-body-size) * 1px)',
          color: 'var(--theme-elevation-600)',
        }}
      >
        Insert variable:
      </span>
      {variables.map((v) => (
        <Pill key={v} size="small" pillStyle="white" onClick={() => handleInsert(v)}>
          {`{${v}}`}
        </Pill>
      ))}
    </div>
  )
}

export default VariableInsert
