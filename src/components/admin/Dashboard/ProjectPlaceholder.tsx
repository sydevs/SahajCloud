import type { ProjectSlug } from '@/payload-types'
import { getProjectLabel } from '@/plugins/access/config'

import { CenteredNotice } from '../helpers/CenteredNotice'

/** Stands in for a project whose own dashboard has not been built yet. */
export default function ProjectPlaceholder({ project }: { project: ProjectSlug }) {
  return (
    <CenteredNotice fullHeight title={getProjectLabel(project)}>
      <p>This project does not have a dashboard yet. Use the sidebar to open its content.</p>
    </CenteredNotice>
  )
}
