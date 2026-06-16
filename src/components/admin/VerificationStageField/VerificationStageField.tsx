'use client'

import type { FieldClientComponent, SelectFieldClient } from 'payload'

import { FieldLabel, useFormFields } from '@payloadcms/ui'
import React from 'react'

import type { VerificationStage } from '@/lib/eventVerification/stages'

import './styles.css'
import { buildStageTracker, formatStageDate, type TrackerStep } from './timeline'

/** `if not verified by 10 Jul 2026` / `next reminder on 26 Jun 2026` / `9 May 2026`. */
function stepDateText(step: TrackerStep): string | null {
  const date = formatStageDate(step.date)
  if (!date) return null
  return step.datePrefix ? `${step.datePrefix} ${date}` : date
}

/** `vstage__step--{status}` (done/current/upcoming) + `--{key}` (stage colour). */
function stepClassName(step: TrackerStep): string {
  return ['vstage__step', `vstage__step--${step.status}`, `vstage__step--${step.key}`].join(' ')
}

/**
 * Read-only visualization of `verificationStage`: a vertical 3-step tracker
 * (Verified → Reminders → Expired) with a one-line caption per step, the
 * relevant date, and the current step highlighted. `finished` (off-path) shows
 * a terminal note above a muted tracker.
 */
export const VerificationStageField: FieldClientComponent = ({ field }) => {
  const { name, label } = field as SelectFieldClient
  const stage = useFormFields(
    ([fields]) => fields?.verificationStage?.value as VerificationStage | undefined,
  )
  const log = useFormFields(([fields]) => fields?.notificationLog?.value)
  const nextCheckAt = useFormFields(([fields]) => fields?.nextCheckAt?.value as string | undefined)
  const updatedAt = useFormFields(([fields]) => fields?.updatedAt?.value as string | undefined)

  const { steps } = buildStageTracker({ log, currentStage: stage, nextCheckAt, updatedAt })

  return (
    <div className="field-type vstage-field read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        <ol className="vstage">
          {steps.map((step) => {
            const dateText = stepDateText(step)
            return (
              <li key={step.key} className={stepClassName(step)}>
                <span className="vstage__rail" aria-hidden="true">
                  <span className="vstage__dot" />
                  <span className="vstage__line" />
                </span>
                <div className="vstage__content">
                  <div className="vstage__head">
                    <span className="vstage__label">{step.label}</span>
                    {dateText ? <span className="vstage__date">{dateText}</span> : null}
                  </div>
                  <span className="vstage__caption">{step.caption}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export default VerificationStageField
