'use client'

import type { SummaryTone } from './summary'
import type { JSONFieldClientComponent } from 'payload'

import { Collapsible, useField, useLocale } from '@payloadcms/ui'
import React from 'react'

import type { ReadinessReport } from '@/lib/status'
import type { ReadinessFieldAdminCustom } from '@/lib/status/virtualReadinessField'

import { ProgressBar } from './ProgressBar'
import { ReadinessGroup } from './ReadinessGroup'
import { ReadinessPill } from './ReadinessPill'
import {
  headerContentStyle,
  headerIndexStyle,
  headerInlineDescStyle,
  headerLinkStyle,
  headerRowStyle,
  headerTitleStyle,
  headerWrapStyle,
  sectionCardStyle,
  tutorialButtonStyle,
} from './styles'

/** Filled play triangle for the "Watch tutorial" button. */
const PlayIcon: React.FC = () => (
  <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
    <path d="M2 1.5L8.5 5L2 8.5Z" fill="currentColor" />
  </svg>
)

export type ReadinessFieldCustom = ReadinessFieldAdminCustom

/**
 * Tone for the section's status icon (and progress bar — they always match):
 * green when every required group passes, amber when there's some document-level
 * progress, red when there's none, neutral when there are no required groups.
 */
function sectionTone(report: ReadinessReport | null): SummaryTone {
  if (!report || report.summary.total === 0) return 'neutral'
  if (report.passing) return 'success'
  return report.progress.passing > 0 ? 'warning' : 'danger'
}

function isReadinessFieldCustom(value: unknown): value is ReadinessFieldCustom {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sectionMetadata' in value &&
    'groupsMetadata' in value &&
    'checksMetadata' in value &&
    'groupKeyToCollection' in value &&
    'groupKeyToGlobal' in value &&
    'configFallback' in value
  )
}

const ReadinessField: JSONFieldClientComponent = ({ field }) => {
  const { value } = useField<ReadinessReport | null>()
  const locale = useLocale()

  const custom = isReadinessFieldCustom(field.admin?.custom) ? field.admin.custom : null

  if (!custom) {
    return (
      <div style={{ color: 'var(--theme-error-500)' }}>
        ReadinessField is missing required admin.custom configuration.
      </div>
    )
  }

  const {
    sectionMetadata,
    groupsMetadata,
    checksMetadata,
    groupKeyToCollection,
    groupKeyToGlobal,
    configFallback,
  } = custom

  const report = value ?? null
  const localeCode = locale?.code ?? 'en'

  const tone = sectionTone(report)

  const configFallbackHref = configFallback
    ? `/admin/globals/${configFallback.slug}?locale=${encodeURIComponent(localeCode)}`
    : null

  return (
    <div style={sectionCardStyle}>
      <Collapsible
        initCollapsed
        header={
          <div style={{ ...headerWrapStyle, paddingRight: 'calc(var(--base) * 0.5)' }}>
            <ReadinessPill size="large" tone={tone} />
            <div style={headerContentStyle}>
              {/* Row 1: index + title + description + links */}
              <div style={headerRowStyle}>
                <span
                  style={{
                    ...headerTitleStyle,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  <span style={headerIndexStyle}>{sectionMetadata.index}.</span>{' '}
                  {sectionMetadata.label}
                  {sectionMetadata.description ? (
                    <span style={headerInlineDescStyle}> · {sectionMetadata.description}</span>
                  ) : null}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    marginLeft: 'calc(var(--base) * 0.35)',
                    display: 'flex',
                    gap: 'calc(var(--base) * 0.5)',
                    position: 'relative',
                    zIndex: 1,
                    pointerEvents: 'all',
                  }}
                >
                  {sectionMetadata.tutorialLink ? (
                    <a
                      href={sectionMetadata.tutorialLink}
                      rel="noopener noreferrer"
                      style={tutorialButtonStyle}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PlayIcon />
                      Watch tutorial
                    </a>
                  ) : null}
                  {configFallbackHref ? (
                    <a
                      href={configFallbackHref}
                      style={headerLinkStyle}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Edit configuration
                    </a>
                  ) : null}
                </span>
              </div>
              {/* Row 2: progress bar (document-level counts, incl. optional groups).
                  Colored by the section tone so it matches the status icon. */}
              {report !== null ? (
                <ProgressBar
                  passing={report.progress.passing}
                  total={report.progress.total}
                  tone={tone}
                  unit="ready"
                />
              ) : null}
            </div>
          </div>
        }
      >
        {report === null ? (
          <div
            style={{
              color: 'var(--theme-elevation-500)',
              padding: 'calc(var(--base) * 0.5) 0',
            }}
          >
            No report — pick a specific locale to compute readiness.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'calc(var(--base) * 0.3)',
            }}
          >
            {report.groups.map((group) => (
              <ReadinessGroup
                key={group.key}
                checksMetadata={checksMetadata}
                collectionSlug={groupKeyToCollection[group.key] ?? null}
                groupGlobalSlug={groupKeyToGlobal[group.key] ?? null}
                group={group}
                groupMetadata={groupsMetadata[group.key]}
                localeCode={localeCode}
              />
            ))}
          </div>
        )}
      </Collapsible>
    </div>
  )
}

export default ReadinessField
