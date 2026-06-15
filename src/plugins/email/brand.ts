import type { BrandColors } from '@/lib/branding'
import { getBrandColors } from '@/lib/branding'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { ProjectSlug } from '@/payload-types'
import { getProjectEmailIcon, getProjectLabel } from '@/plugins/access'

/**
 * Resolved per-project branding for a transactional email.
 *
 * Composed from the existing project/branding helpers — the single seam that
 * makes email branding configurable. Templates read these fields and never
 * reference a hardcoded project, color, or product name.
 */
export interface EmailBrand {
  /** Human-readable product name, e.g. `"WeMeditate Web"`. */
  productName: string
  /** Brand colors (primary / dark / light) for the project. */
  colors: BrandColors
  /** Absolute URL to the project icon — a PNG (email-safe), since emails can't
   * resolve relative paths and render SVG/WebP poorly. */
  iconUrl: string
}

/**
 * Resolve the branding for a transactional email.
 *
 * @param project - Project to brand the email for. Defaults to `wemeditate-web`;
 *   every send may override it to brand for another project.
 */
export function getEmailBrand(project: ProjectSlug = 'wemeditate-web'): EmailBrand {
  return {
    productName: getProjectLabel(project),
    colors: getBrandColors(project),
    iconUrl: `${getServerUrl()}${getProjectEmailIcon(project)}`,
  }
}
