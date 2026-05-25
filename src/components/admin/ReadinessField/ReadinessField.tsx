'use client'

import type { JSONFieldClientComponent } from 'payload'

import { Collapsible, useField, useLocale } from '@payloadcms/ui'
import React from 'react'

import type { ReadinessReport } from '@/lib/status'

import { ReadinessGroup } from './ReadinessGroup'
import {
  headerDescriptionStyle,
  headerLinkStyle,
  headerRowStyle,
  headerTitleStyle,
  sectionCardStyle,
} from './styles'
import { SummaryBadge } from './SummaryBadge'

export interface ReadinessFieldCustom {
  sectionMetadata: {
    key: string
    label: string
    description: string
    tutorialLink: string | null
  }
  groupsMetadata: Record<string, { label: string; description: string }>
  checksMetadata: Record<string, { label: string; description: string }>
  groupKeyToCollection: Record<string, string | null>
  configFallback: { type: 'global'; slug: string } | null
}

function isReadinessFieldCustom(value: unknown): value is ReadinessFieldCustom {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sectionMetadata' in value &&
    'groupsMetadata' in value &&
    'checksMetadata' in value &&
    'groupKeyToCollection' in value
  )
}

const ReadinessField: JSONFieldClientComponent = ({ field }) => {
  const { value } = useField<ReadinessReport | null>()
  const locale = useLocale()

  const custom = isReadinessFieldCustom(field.admin?.custom)
    ? field.admin.custom
    : null

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
    configFallback,
  } = custom

  const report = value ?? null
  const localeCode = locale?.code ?? 'en'

  const summary = report?.summary ?? { passing: 0, total: 0 }
  const optionalSummary = report?.optionalSummary

  const configFallbackHref = configFallback
    ? `/admin/globals/${configFallback.slug}?locale=${encodeURIComponent(localeCode)}`
    : null

  return (
    <div style={sectionCardStyle}>
      <Collapsible
        header={
          <div style={headerRowStyle}>
            <span style={headerTitleStyle}>{sectionMetadata.label}</span>
            <SummaryBadge passing={summary.passing} total={summary.total} />
            {optionalSummary ? (
              <SummaryBadge
                passing={optionalSummary.passing}
                total={optionalSummary.total}
                prefix="optional"
                subtle
              />
            ) : null}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 'calc(var(--base) * 0.5)' }}>
              {sectionMetadata.tutorialLink ? (
                <a
                  href={sectionMetadata.tutorialLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={headerLinkStyle}
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
        }
      >
        <div style={headerDescriptionStyle}>{sectionMetadata.description}</div>
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
                group={group}
                groupMetadata={groupsMetadata[group.key]}
                checksMetadata={checksMetadata}
                collectionSlug={groupKeyToCollection[group.key] ?? null}
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
