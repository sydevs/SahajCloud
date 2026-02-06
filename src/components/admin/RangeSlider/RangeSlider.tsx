'use client'

import React, { useMemo } from 'react'
import { Range, getTrackBackground } from 'react-range'

export interface RangeSliderProps {
  value: number | null
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  labels?: Record<number, string>
  readOnly?: boolean
  'aria-label'?: string
}

/**
 * Discrete Range Slider Component
 *
 * A draggable range slider built on react-range with discrete step markers
 * and optional custom labels. Styled with PayloadCMS CSS variables.
 *
 * @example
 * ```tsx
 * <RangeSlider
 *   value={3}
 *   onChange={setValue}
 *   min={1}
 *   max={5}
 *   labels={{ 1: 'Low', 3: 'Medium', 5: 'High' }}
 * />
 * ```
 */
export const RangeSlider: React.FC<RangeSliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  labels,
  readOnly = false,
  'aria-label': ariaLabel,
}) => {
  const steps = useMemo(() => {
    const result: number[] = []
    for (let v = min; v <= max; v += step) {
      result.push(v)
    }
    if (result[result.length - 1] !== max) {
      result.push(max)
    }
    return result
  }, [min, max, step])

  const effectiveValue = value ?? min

  return (
    <div style={{ padding: 'calc(var(--base) * 0.7) 0 0', opacity: readOnly ? 0.5 : 1 }}>
      <Range
        values={[effectiveValue]}
        min={min}
        max={max}
        step={step}
        disabled={readOnly}
        onChange={([v]) => onChange(v)}
        renderMark={({ props: markProps, index }) => (
          <div
            {...markProps}
            key={markProps.key}
            style={{
              ...markProps.style,
              height: '6px',
              width: '6px',
              borderRadius: '50%',
              backgroundColor:
                min + index * step <= effectiveValue
                  ? 'var(--theme-success-500)'
                  : 'var(--theme-elevation-300)',
            }}
          />
        )}
        renderTrack={({ props: trackProps, children }) => (
          <div
            {...trackProps}
            style={{
              ...trackProps.style,
              height: '4px',
              borderRadius: '2px',
              background: getTrackBackground({
                values: [effectiveValue],
                colors: ['var(--theme-success-500)', 'var(--theme-elevation-200)'],
                min,
                max,
              }),
            }}
          >
            {children}
          </div>
        )}
        renderThumb={({ props: thumbProps, isDragged }) => (
          <div
            {...thumbProps}
            key={thumbProps.key}
            aria-label={ariaLabel}
            style={{
              ...thumbProps.style,
              height: '16px',
              width: '16px',
              borderRadius: '50%',
              backgroundColor: 'var(--theme-success-500)',
              boxShadow: isDragged
                ? '0 0 0 3px var(--theme-success-300)'
                : '0 1px 2px rgba(0,0,0,0.2)',
              outline: 'none',
            }}
          />
        )}
      />

      {/* Labels row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'calc(var(--base) * 0.25)',
          marginBottom: 'calc(var(--base) * 0.5)',
          userSelect: 'none',
        }}
      >
        {steps.map((stepValue) => {
          const labelText = labels ? (labels[stepValue] ?? '') : String(stepValue)
          const isActive = stepValue === effectiveValue

          return (
            <span
              key={stepValue}
              style={{
                fontSize: 'calc(var(--base-body-size) * 0.8px)',
                lineHeight: 1.2,
                color: isActive ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-500)',
                fontWeight: isActive ? 600 : 400,
                textAlign: 'center',
                flex: 1,
              }}
            >
              {labelText}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default RangeSlider
