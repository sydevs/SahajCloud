/**
 * Custom Scalar plugin for PayloadCMS.
 *
 * It replaces payload-oapi's basic Scalar plugin. It adds:
 * - We Meditate coral branding (#F07855)
 * - A project selector that filters visible endpoints
 * - A logo that changes with the selected project
 * - A short list of HTTP client examples (JS, Node, Dart, Python only)
 */

import type { Config, Endpoint } from 'payload'

import { getScalarThemeColors, type ScalarThemeColors } from '@/lib/branding'
import { serverEnv } from '@/lib/env'
import type { ProjectSlug } from '@/payload-types'
import { getProjectIcon, getProjectLabel, getProjectOptions, isValidProject } from '@/plugins/access'
import { checkBasicAuth } from '@/plugins/openapi/basicAuth'

export interface ScalarPluginOptions {
  /** Path to the OpenAPI spec endpoint. Default: '/openapi.json'. */
  specEndpoint?: string
  /** URL path for the Scalar docs UI. Default: '/docs'. */
  docsUrl?: string
  /** Turns the plugin on or off. Default: true. */
  enabled?: boolean
}

/**
 * Theme colors come from the shared brand colors in @/lib/branding.
 * This keeps the Scalar API docs and the PayloadCMS admin theme consistent.
 * See src/lib/branding/themeColors.ts for the single source of truth.
 */

/**
 * Generate CSS theme overrides for one project.
 * Returns an empty string for the default Scalar theme.
 */
function generateThemeCss(theme: ScalarThemeColors | null): string {
  if (!theme) return '' // Use Scalar's default theme.

  return `
    /* Dynamic Theme based on selected project */
    :root {
      --scalar-color-1: ${theme.accent};
      --scalar-color-2: ${theme.accentDark};
      --scalar-color-3: #333333;
      --scalar-color-accent: ${theme.accent};
      --scalar-background-1: #ffffff;
      --scalar-background-2: ${theme.background2Light};
      --scalar-background-3: ${theme.background3Light};
      --scalar-background-accent: ${theme.accent};
      --scalar-border-color: #eeeeee;
      --scalar-scrollbar-color: ${theme.accent}4d;
      --scalar-scrollbar-color-active: ${theme.accent}80;
    }

    /* Dark mode adjustments */
    .dark-mode {
      --scalar-color-1: ${theme.accentLight};
      --scalar-color-2: ${theme.accent};
      --scalar-color-3: #f5f5f5;
      --scalar-color-accent: ${theme.accentLight};
      --scalar-background-1: #1a1a1a;
      --scalar-background-2: ${theme.background2Dark};
      --scalar-background-3: ${theme.background3Dark};
      --scalar-background-accent: ${theme.accent};
      --scalar-border-color: #3a3a3a;
    }

    .api-header-select:focus {
      box-shadow: 0 0 0 2px ${theme.accent}33;
    }`
}

/**
 * Generate project-selector options from the project metadata.
 */
function getProjectSelectorOptions(): string {
  const options = getProjectOptions()
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join('\n          ')

  return `<option value="">All Endpoints</option>
          ${options}`
}

/**
 * Generate the custom Scalar HTML, with branding and the project selector.
 */
function generateScalarHtml(specUrl: string, project: ProjectSlug | null, baseUrl: string): string {
  const currentLogo = getProjectIcon(project)
  const projectTitle = getProjectLabel(project)
  const theme = getScalarThemeColors(project)

  // Build the full spec URL, with the project parameter.
  const fullSpecUrl = project ? `${specUrl}?project=${project}` : specUrl

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectTitle} API Documentation</title>
  <meta name="description" content="REST API documentation for ${projectTitle}" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="${currentLogo}" />
  <!-- Critical CSS first to prevent flash of unstyled content -->
  <style>
    /* CSS reset and base colors. This block must load first. */
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    html.dark-mode, html.dark-mode body {
      background: #1a1a1a;
    }
  </style>
  <!-- Blocking dark-mode detection. This runs after the critical CSS above. -->
  <script>
    (function() {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark-mode');
      }
    })();
  </script>
  <!-- Non-critical resources load after dark mode is set -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${generateThemeCss(theme)}

    /* Custom Header Bar - scrolls with page */
    .api-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 48px;
      padding: 0 20px;
      background: var(--scalar-background-1, #ffffff);
      border-bottom: 1px solid var(--scalar-border-color, #eeeeee);
      box-sizing: border-box;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .dark-mode .api-header {
      background: var(--scalar-background-1, #1a1a1a);
      border-bottom-color: var(--scalar-border-color, #3a3a3a);
    }

    .api-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .api-header-logo {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: contain;
    }

    .api-header-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--scalar-color-3, #333333);
    }

    .dark-mode .api-header-title {
      color: var(--scalar-color-3, #f5f5f5);
    }

    .api-header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .api-header-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--scalar-color-3, #333333);
      opacity: 0.7;
      white-space: nowrap;
    }

    .dark-mode .api-header-label {
      color: var(--scalar-color-3, #f5f5f5);
    }

    .api-header-select {
      padding: 5px 10px;
      font-size: 12px;
      border: 1px solid var(--scalar-border-color, #eeeeee);
      border-radius: 6px;
      background: var(--scalar-background-1, #ffffff);
      color: var(--scalar-color-3, #333333);
      cursor: pointer;
      min-width: 150px;
    }

    .dark-mode .api-header-select {
      border-color: var(--scalar-border-color, #3a3a3a);
      background: var(--scalar-background-1, #1a1a1a);
      color: var(--scalar-color-3, #f5f5f5);
    }

    .api-header-select:hover {
      border-color: var(--scalar-color-accent, #666666);
    }

    .api-header-select:focus {
      outline: none;
      border-color: var(--scalar-color-accent, #666666);
    }

    /* Mobile responsive header */
    @media (max-width: 640px) {
      .api-header {
        flex-direction: column;
        align-items: flex-start;
        height: auto;
        padding: 12px 16px;
        gap: 10px;
      }

      .api-header-left {
        gap: 10px;
      }

      .api-header-right {
        width: 100%;
      }

      .api-header-label {
        display: none;
      }

      .api-header-select {
        width: 100%;
        min-width: unset;
      }
    }
  </style>
</head>
<body>
  <!-- Custom Header Bar -->
  <header class="api-header">
    <div class="api-header-left">
      <img src="${baseUrl}${currentLogo}" alt="Logo" class="api-header-logo" id="project-logo" />
      <span class="api-header-title" id="header-title">${projectTitle} API</span>
    </div>
    <div class="api-header-right">
      <label class="api-header-label" for="project-select">Select Project:</label>
      <select class="api-header-select" id="project-select" onchange="handleProjectChange(this.value)">
        ${getProjectSelectorOptions()}
      </select>
    </div>
  </header>

  <script>
    // Change the URL when the project selection changes.
    function handleProjectChange(project) {
      const url = new URL(window.location);
      if (project) {
        url.searchParams.set('project', project);
      } else {
        url.searchParams.delete('project');
      }
      window.location.href = url.toString();
    }

    document.addEventListener('DOMContentLoaded', function() {
      const params = new URLSearchParams(window.location.search);
      const currentProject = params.get('project') || '';
      document.getElementById('project-select').value = currentProject;

      // Watch for system dark mode changes. The blocking script above sets the initial mode.
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (e.matches) {
          document.documentElement.classList.add('dark-mode');
        } else {
          document.documentElement.classList.remove('dark-mode');
        }
      });

      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
      script.onload = function() {
        Scalar.createApiReference('#scalar-app', {
          url: '${fullSpecUrl}',
          darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
          layout: 'modern',
          hideModels: true,
          hideClientButton: true,
          showDeveloperTools: "never",
          defaultHttpClient: {
            targetKey: 'node',
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
          },
          authentication: {
            preferredSecurityScheme: 'API-Key',
            securitySchemes: {
              'API-Key': {
                value: 'clients API-Key '
              }
            }
          }
        });
      };
      document.body.appendChild(script);
    });
  </script>
  <div id="scalar-app"></div>
</body>
</html>`
}

/**
 * Custom Scalar plugin for PayloadCMS.
 *
 * It provides We Meditate branded API documentation, filtered by project.
 *
 * @param options - Plugin configuration options.
 * @returns A PayloadCMS plugin function.
 */
export const scalarPlugin =
  ({
    specEndpoint = '/openapi.json',
    docsUrl = '/docs',
    enabled = true,
  }: ScalarPluginOptions = {}) =>
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
            const docsPassword = serverEnv.DOCS_PASSWORD
            if (docsPassword) {
              const authHeader = req.headers.get('authorization') ?? ''
              if (!checkBasicAuth(authHeader, docsPassword)) {
                return new Response('Authentication required', {
                  status: 401,
                  headers: {
                    'WWW-Authenticate': 'Basic realm="Sahaj Cloud API Documentation"',
                    'Content-Type': 'text/plain',
                    'Cache-Control': 'no-store',
                  },
                })
              }
            }

            // Build the base URL the same way payload-oapi does.
            const baseUrl = `${req.protocol}//${req.headers.get('host')}`
            const fullSpecUrl = `${baseUrl}/api${specEndpoint}`

            // Read the project from the query string. Avoid new URL(), which can throw.
            const queryString = req.url?.split('?')[1] || ''
            const urlParams = new URLSearchParams(queryString)
            const projectParam = urlParams.get('project')
            const project: ProjectSlug | null =
              projectParam && isValidProject(projectParam) ? projectParam : null

            // Generate the HTML, with branding and the project selector.
            const html = generateScalarHtml(fullSpecUrl, project, baseUrl)

            return new Response(html, {
              headers: {
                'Content-Type': 'text/html',
                // Do not cache a password-protected page publicly.
                'Cache-Control': docsPassword ? 'private, no-store' : 'public, max-age=3600',
                'X-Robots-Tag': 'noindex, nofollow',
              },
            })
          },
        },
      ],
    }
  }

export default scalarPlugin
