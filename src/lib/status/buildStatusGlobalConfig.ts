import type { SectionSpec, StatusGlobalSpec } from './spec'
import type { GlobalConfig } from 'payload'

import { adminOnlyCondition } from '@/lib/access'

import { runSection } from './runSection'
import { virtualReadinessField, type ReadinessFieldAdminCustom } from './virtualReadinessField'

/**
 * Slice the section spec's group + check metadata down to the JSON-serializable
 * shape the admin widget consumes via `field.admin.custom`.
 */
function sliceMetadata<TConfig>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: SectionSpec<TConfig, any>,
): Pick<ReadinessFieldAdminCustom, 'groupsMetadata' | 'checksMetadata'> {
  const groupsMetadata: Record<string, { label: string; description: string }> = {}
  for (const group of section.groups) {
    groupsMetadata[group.key] = { label: group.label, description: group.description }
  }
  const checksMetadata: Record<string, { label: string; description: string }> = {}
  for (const [key, meta] of Object.entries(section.checks)) {
    checksMetadata[key] = { label: meta.label, description: meta.description }
  }
  return { groupsMetadata, checksMetadata }
}

/**
 * Build the Payload `GlobalConfig` for a status global from its spec.
 * Wires every section to its `runSection`-backed virtual field and
 * attaches the project's Configuration tab (admin-only by convention).
 */
export function buildStatusGlobalConfig<TConfig>(
  spec: StatusGlobalSpec<TConfig>,
): GlobalConfig {
  const groupCollectionMap = spec.groupCollectionMap ?? {}
  const sectionConfigFallback = spec.sectionConfigFallback ?? {}

  const sectionFields = spec.sections.map((section) => {
    const { groupsMetadata, checksMetadata } = sliceMetadata(section)

    // The widget's `groupKeyToCollection` only needs entries for this
    // section's groups — slice the global map down.
    const groupKeyToCollection: Record<string, string | null> = {}
    for (const group of section.groups) {
      groupKeyToCollection[group.key] = groupCollectionMap[group.key] ?? null
    }

    const adminCustom: ReadinessFieldAdminCustom = {
      sectionMetadata: {
        key: section.key,
        label: section.label,
        description: section.description,
        tutorialLink: section.tutorialLink,
      },
      groupsMetadata,
      checksMetadata,
      groupKeyToCollection,
      configFallback: sectionConfigFallback[section.key] ?? null,
    }

    return virtualReadinessField(
      section.key,
      (payload, locale, config, req) =>
        runSection(section, { payload, locale, config, req }),
      spec.extractConfig,
      adminCustom,
    )
  })

  return {
    slug: spec.slug,
    admin: { group: spec.adminGroup },
    label: spec.label,
    fields: [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Status',
            description:
              'Per-locale launch-readiness report. Each section is recomputed when the global is read.',
            fields: sectionFields,
          },
          {
            label: 'Configuration',
            description: 'Readiness configuration. Admin-only.',
            admin: { condition: adminOnlyCondition },
            fields: spec.configTabFields,
          },
        ],
      },
    ],
  }
}
