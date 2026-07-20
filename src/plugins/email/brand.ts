import type { BrandColors } from '@/lib/branding'
import { getBrandColors } from '@/lib/branding'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Client, ProjectSlug } from '@/payload-types'
import { getProjectEmailIcon, getProjectLabel } from '@/plugins/access'
import { getCloudflareImagesUrl } from '@/plugins/storage'

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

/**
 * Cloudflare Images variant for a client logo in an email.
 *
 * `format=png` is deliberate: Cloudflare's default `auto` negotiates WebP/AVIF
 * from the request headers, but an email client fetching the image sends no
 * usable `Accept`, and Outlook can't render either format. A fixed-width raster
 * also stops a large upload from blowing out the header on mobile.
 */
const EMAIL_LOGO_VARIANT = 'format=png,width=192'

/**
 * Resolve the logo of a client to an email-safe absolute PNG URL.
 *
 * Returns `null` when there is no logo, when the upload relationship wasn't
 * populated (read at `depth: 0`, so only the id is present), or when
 * Cloudflare Images isn't configured — every case falls back to the project icon.
 */
function resolveClientLogoUrl(logo: Client['logo']): string | null {
  if (!logo || typeof logo !== 'object' || !logo.filename) return null
  return getCloudflareImagesUrl(logo.filename, EMAIL_LOGO_VARIANT) ?? null
}

/**
 * Resolve the branding for an email sent on behalf of a **client service**.
 *
 * Registrant-facing mail is branded with the service the registration came
 * from, not with Sahaj Atlas itself. Each field falls back independently to the
 * `sahaj-atlas` project brand, so a client that has configured only a colour
 * still gets a sensible product name and icon.
 *
 * Only the client-scoped path is new — `getEmailBrand` and every manager/auth
 * template that calls it are untouched.
 *
 * @param client - The client service, with `logo` populated (`depth >= 1`).
 */
export function getClientEmailBrand(
  client: Pick<Client, 'color1' | 'color2' | 'logo' | 'name'>,
): EmailBrand {
  const fallback = getEmailBrand('sahaj-atlas')

  return {
    productName: client.name || fallback.productName,
    colors: {
      primary: client.color1 || fallback.colors.primary,
      light: client.color2 || fallback.colors.light,
      // `Clients` has no dark variant — the layout only uses primary + light
      // for the gradient, so inheriting the project's dark keeps BrandColors whole.
      dark: fallback.colors.dark,
    },
    iconUrl: resolveClientLogoUrl(client.logo) ?? fallback.iconUrl,
  }
}
