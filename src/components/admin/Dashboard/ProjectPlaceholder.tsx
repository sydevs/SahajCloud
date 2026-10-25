import type { ProjectSlug } from '@/payload-types'

import { getProjectLabel } from '@/plugins/access/config'

/** Stands in for a project whose own dashboard has not been built yet. */
export default function ProjectPlaceholder({ project }: { project: ProjectSlug }) {
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
          textAlign: 'center',
          background: 'var(--theme-elevation-50)',
          padding: 'calc(var(--base) * 2.5)',
          borderRadius: 'var(--style-radius-m)',
          border: '1px solid var(--theme-elevation-200)',
        }}
      >
        <h2
          style={{
            fontWeight: 'bold',
            color: 'var(--theme-elevation-900)',
            marginBottom: 'calc(var(--base) * 0.8)',
          }}
        >
          {getProjectLabel(project)}
        </h2>
        <p
          style={{
            fontSize: 'calc(var(--base-body-size) * 1.15px)',
            color: 'var(--theme-elevation-600)',
            margin: 0,
          }}
        >
          This project does not have a dashboard yet. Use the sidebar to open its content.
        </p>
      </div>
    </div>
  )
}
