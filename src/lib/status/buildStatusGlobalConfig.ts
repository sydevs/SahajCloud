import type { StatusGlobalSpec } from './spec'
import type { GlobalConfig } from 'payload'

import { adminOnlyCondition } from '@/lib/access'

import { runSection } from './runSection'
import { virtualReadinessField } from './virtualReadinessField'

/**
 * Build the Payload `GlobalConfig` for a status global from its spec.
 * Wires every section to its `runSection`-backed virtual field and
 * attaches the project's Configuration tab (admin-only by convention).
 */
export function buildStatusGlobalConfig<TConfig>(
  spec: StatusGlobalSpec<TConfig>,
): GlobalConfig {
  const sectionFields = spec.sections.map((section) =>
    virtualReadinessField(
      section.key,
      (payload, locale, config, req) =>
        runSection(section, { payload, locale, config, req }),
      spec.extractConfig,
    ),
  )

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
