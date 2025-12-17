'use client'

import type { ProjectSlug } from '@/lib/projects'
import { getProjectLabel } from '@/lib/projects'

import ProjectSelector from '../ProjectSelector'

interface Props {
  allowedProjects: ProjectSlug[]
}

/**
 * ProjectSelectionPrompt Component
 *
 * Displayed on dashboard when a manager has undefined currentProject.
 * Shows ProjectSelector if they have access to projects, or a message if they have no access.
 */
export default function ProjectSelectionPrompt({ allowedProjects }: Props) {
  // No projects available - show error message
  if (allowedProjects.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: 'var(--base)',
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            textAlign: 'center',
            background: 'var(--theme-elevation-50)',
            padding: 'calc(var(--base) * 2.5)',
            borderRadius: 'var(--style-radius-m)',
            border: '2px solid var(--theme-elevation-200)',
          }}
        >
          <div
            style={{
              fontSize: 'calc(var(--base-body-size) * 4px)',
              marginBottom: 'calc(var(--base) * 1.5)',
            }}
          >
            ⚠️
          </div>
          <h1
            style={{
              fontSize: 'calc(var(--base-body-size) * 2px)',
              fontWeight: 'bold',
              color: 'var(--theme-elevation-900)',
              marginBottom: 'calc(var(--base) * 0.8)',
            }}
          >
            No Projects Available
          </h1>
          <p
            style={{
              fontSize: 'calc(var(--base-body-size) * 1.15px)',
              color: 'var(--theme-elevation-700)',
              lineHeight: '1.6',
              marginBottom: 'calc(var(--base) * 1.5)',
            }}
          >
            You don&apos;t have access to any projects yet. Please contact an administrator to
            request access.
          </p>
          <div
            style={{
              background: 'var(--theme-elevation-100)',
              padding: 'calc(var(--base) * 1.2)',
              borderRadius: 'var(--style-radius-s)',
            }}
          >
            <p
              style={{
                fontSize: 'calc(var(--base-body-size) * 0.95px)',
                color: 'var(--theme-elevation-600)',
                margin: 0,
              }}
            >
              Contact:{' '}
              <a
                href="mailto:contact@sydevelopers.com"
                style={{
                  color: 'var(--theme-elevation-800)',
                  fontWeight: '600',
                  textDecoration: 'underline',
                }}
              >
                contact@sydevelopers.com
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Has projects - show selector
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 'var(--base)',
      }}
    >
      <div
        style={{
          maxWidth: '500px',
          width: '100%',
          background: 'var(--theme-elevation-50)',
          padding: 'calc(var(--base) * 2.5)',
          borderRadius: 'var(--style-radius-m)',
          border: '1px solid var(--theme-elevation-200)',
        }}
      >
        <h1
          style={{
            fontSize: 'calc(var(--base-body-size) * 2px)',
            fontWeight: 'bold',
            color: 'var(--theme-elevation-900)',
            marginBottom: 'calc(var(--base) * 0.8)',
            textAlign: 'center',
          }}
        >
          Select a Project
        </h1>
        <p
          style={{
            fontSize: 'calc(var(--base-body-size) * 1.15px)',
            color: 'var(--theme-elevation-700)',
            lineHeight: '1.6',
            marginBottom: 'calc(var(--base) * 2)',
            textAlign: 'center',
          }}
        >
          Please select a project to get started:
        </p>

        {/* List available projects */}
        <div
          style={{
            background: 'var(--theme-elevation-100)',
            padding: 'calc(var(--base) * 1.2)',
            borderRadius: 'var(--style-radius-s)',
            marginBottom: 'calc(var(--base) * 2)',
          }}
        >
          <p
            style={{
              fontSize: 'calc(var(--base-body-size) * 0.95px)',
              color: 'var(--theme-elevation-600)',
              marginBottom: 'calc(var(--base) * 0.6)',
              fontWeight: '600',
            }}
          >
            Available Projects:
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 'calc(var(--base) * 1.2)',
              color: 'var(--theme-elevation-700)',
              fontSize: 'calc(var(--base-body-size) * 0.95px)',
            }}
          >
            {allowedProjects.map((project) => (
              <li key={project}>{getProjectLabel(project)}</li>
            ))}
          </ul>
        </div>

        {/* Project Selector */}
        <ProjectSelector />
      </div>
    </div>
  )
}
