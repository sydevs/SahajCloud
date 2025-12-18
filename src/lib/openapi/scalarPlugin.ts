/**
 * Custom Scalar Plugin for PayloadCMS
 *
 * Replaces payload-oapi's basic Scalar plugin with a customized version featuring:
 * - We Meditate coral branding (#F07855)
 * - Client role selector for filtering visible endpoints
 * - Dynamic logo based on selected role
 * - Prioritized HTTP client examples (JS, Node, Dart, Python only)
 */

import type { Config, Endpoint } from 'payload'

import { CLIENT_ROLES } from '@/fields/permissionsField'
import type { ClientRole } from '@/types/roles'

export interface ScalarPluginOptions {
  /** Path to the OpenAPI spec endpoint (default: '/openapi.json') */
  specEndpoint?: string
  /** URL path for the Scalar docs UI (default: '/docs') */
  docsUrl?: string
  /** Enable/disable the plugin (default: true) */
  enabled?: boolean
}

/**
 * Logo paths for each client role
 */
const ROLE_LOGOS: Record<ClientRole | 'default', string> = {
  default: '/images/sahaj-cloud.svg',
  'we-meditate-web': '/images/wemeditate-web.svg',
  'we-meditate-app': '/images/wemeditate-app.svg',
  'sahaj-atlas': '/images/sahaj-atlas.webp',
}

/**
 * Generate role selector options from CLIENT_ROLES
 */
function getRoleSelectorOptions(): string {
  const options = Object.values(CLIENT_ROLES)
    .map((role) => `<option value="${role.slug}">${role.label}</option>`)
    .join('\n          ')

  return `<option value="">All Endpoints</option>
          ${options}`
}

/**
 * Generate the custom Scalar HTML with branding and role selector
 */
function generateScalarHtml(
  specUrl: string,
  role: ClientRole | null,
  baseUrl: string,
): string {
  const currentLogo = role ? ROLE_LOGOS[role] : ROLE_LOGOS.default

  // Build the full spec URL with role parameter
  const fullSpecUrl = role ? `${specUrl}?role=${role}` : specUrl

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We Meditate API Documentation</title>
  <meta name="description" content="REST API documentation for We Meditate content management" />
  <link rel="icon" type="image/svg+xml" href="${currentLogo}" />
  <style>
    /* We Meditate Coral Theme */
    :root {
      --scalar-color-1: #F07855;
      --scalar-color-2: #D86545;
      --scalar-color-3: #333333;
      --scalar-color-accent: #F07855;
      --scalar-background-1: #ffffff;
      --scalar-background-2: #FFF5F2;
      --scalar-background-3: #fce4df;
      --scalar-background-accent: #F07855;
      --scalar-border-color: #eeeeee;
      --scalar-scrollbar-color: rgba(240, 120, 85, 0.3);
      --scalar-scrollbar-color-active: rgba(240, 120, 85, 0.5);
    }

    /* Dark mode adjustments */
    .dark-mode {
      --scalar-color-1: #F07855;
      --scalar-color-2: #FF9477;
      --scalar-color-3: #e0e0e0;
      --scalar-color-accent: #F07855;
      --scalar-background-1: #1a1a1a;
      --scalar-background-2: #2d2a29;
      --scalar-background-3: #3d3533;
      --scalar-background-accent: #F07855;
      --scalar-border-color: #444444;
    }

    /* Role Selector Styles */
    .role-selector-container {
      position: fixed;
      top: 12px;
      right: 16px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: var(--scalar-background-2);
      border: 1px solid var(--scalar-border-color);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .role-selector-logo {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: contain;
    }

    .role-selector-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--scalar-color-3);
      white-space: nowrap;
    }

    .role-selector-select {
      padding: 6px 10px;
      font-size: 13px;
      border: 1px solid var(--scalar-border-color);
      border-radius: 6px;
      background: var(--scalar-background-1);
      color: var(--scalar-color-3);
      cursor: pointer;
      min-width: 160px;
    }

    .role-selector-select:hover {
      border-color: var(--scalar-color-accent);
    }

    .role-selector-select:focus {
      outline: none;
      border-color: var(--scalar-color-accent);
      box-shadow: 0 0 0 2px rgba(240, 120, 85, 0.2);
    }

    /* Adjust main content to not overlap with fixed header */
    .scalar-app {
      padding-top: 0 !important;
    }
  </style>
</head>
<body>
  <!-- Role Selector UI -->
  <div class="role-selector-container" id="role-selector">
    <img src="${baseUrl}${currentLogo}" alt="Logo" class="role-selector-logo" id="role-logo" />
    <span class="role-selector-label">API Client:</span>
    <select class="role-selector-select" id="client-role-select" onchange="handleRoleChange(this.value)">
      ${getRoleSelectorOptions()}
    </select>
  </div>

  <!-- Scalar API Reference -->
  <div id="scalar-app"></div>

  <script>
    // Role logos mapping
    const roleLogos = ${JSON.stringify(ROLE_LOGOS)};

    // Handle role selection change
    function handleRoleChange(role) {
      const url = new URL(window.location);
      if (role) {
        url.searchParams.set('role', role);
      } else {
        url.searchParams.delete('role');
      }
      window.location.href = url.toString();
    }

    // Update logo when role changes (without page reload for preview)
    function updateLogo(role) {
      const logo = document.getElementById('role-logo');
      const logoPath = role ? roleLogos[role] : roleLogos.default;
      logo.src = '${baseUrl}' + logoPath;
    }

    // Set initial role value from URL
    document.addEventListener('DOMContentLoaded', function() {
      const params = new URLSearchParams(window.location.search);
      const currentRole = params.get('role') || '';
      document.getElementById('client-role-select').value = currentRole;

      // Detect dark mode preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark-mode');
      }

      // Watch for system dark mode changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (e.matches) {
          document.documentElement.classList.add('dark-mode');
        } else {
          document.documentElement.classList.remove('dark-mode');
        }
      });
    });
  </script>

  <!-- Load Scalar API Reference -->
  <script
    id="api-reference"
    data-url="${fullSpecUrl}"
    data-proxy-url="https://proxy.scalar.com"
  >
    // Scalar configuration
    window.scalarConfig = {
      theme: 'none',
      layout: 'modern',
      showSidebar: true,
      hideModels: false,
      hideDownloadButton: false,
      hideTestRequestButton: false,
      defaultHttpClient: {
        targetKey: 'javascript',
        clientKey: 'fetch'
      },
      hiddenClients: {
        c: true,
        clojure: true,
        csharp: true,
        go: true,
        php: true,
        java: true,
        kotlin: true,
        objc: true,
        ocaml: true,
        powershell: true,
        r: true,
        ruby: true,
        swift: true
      }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`
}

/**
 * Custom Scalar Plugin for PayloadCMS
 *
 * Provides We Meditate branded API documentation with role-based filtering.
 *
 * @param options - Plugin configuration options
 * @returns PayloadCMS plugin function
 */
export const scalarPlugin =
  ({ specEndpoint = '/openapi.json', docsUrl = '/docs', enabled = true }: ScalarPluginOptions = {}) =>
  (config: Config): Config => {
    if (!enabled) {
      return config
    }

    const existingEndpoints = (config.endpoints || []) as Endpoint[]

    return {
      ...config,
      endpoints: [
        ...existingEndpoints,
        {
          method: 'get',
          path: docsUrl,
          handler: async (req) => {
            // Get base URL from request
            const protocol = req.protocol || 'http'
            const host = req.headers.get('host') || 'localhost:3000'
            const baseUrl = `${protocol}://${host}`

            // Get role from query parameters
            const url = new URL(req.url || `${baseUrl}${docsUrl}`, baseUrl)
            const roleParam = url.searchParams.get('role')
            const role: ClientRole | null =
              roleParam && Object.keys(CLIENT_ROLES).includes(roleParam)
                ? (roleParam as ClientRole)
                : null

            // Build full spec URL
            const fullSpecUrl = `${baseUrl}/api${specEndpoint}`

            // Generate HTML with branding and role selector
            const html = generateScalarHtml(fullSpecUrl, role, baseUrl)

            return new Response(html, {
              headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
              },
            })
          },
        },
      ],
    }
  }

export default scalarPlugin
