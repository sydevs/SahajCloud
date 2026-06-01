'use client'

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
} from './styles'
import { summaryTone } from './summary'

export type ReadinessFieldCustom = ReadinessFieldAdminCustom

function isReadinessFieldCustom(value: unknown): value is ReadinessFieldCustom {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sectionMetadata' in value &&
    'groupsMetadata' in value &&
    'checksMetadata' in value &&
    'groupKeyToCollection' in value &&
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

  const { sectionMetadata, groupsMetadata, checksMetadata, groupKeyToCollection, configFallback } =
    custom

  const report = value ?? null
  const localeCode = locale?.code ?? 'en'

  const summary = report?.summary ?? { passing: 0, total: 0 }
  const tone = report ? summaryTone(summary.passing, summary.total) : 'neutral'

  const configFallbackHref = configFallback
    ? `/admin/globals/${configFallback.slug}?locale=${encodeURIComponent(localeCode)}`
    : null

  return (
    <div style={sectionCardStyle}>
      <Collapsible
        initCollapsed
        header={
          <div style={headerWrapStyle}>
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
                      style={headerLinkStyle}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                    >
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
              {/* Row 2: progress bar */}
              {report !== null ? (
                <ProgressBar passing={summary.passing} total={summary.total} unit="groups ready" />
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
              marginTop: 'calc(var(--base) * 0.5)',
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
