import type { ReactNode } from 'react'

import styles from './CenteredNotice.module.css'

type CenteredNoticeProps = {
  title: ReactNode
  icon?: ReactNode
  /** Center the notice in the page's height, for a notice that is the whole view. */
  fullHeight?: boolean
  children?: ReactNode
}

/** A centered card for an empty or holding state: icon, heading, then any copy or actions. */
export function CenteredNotice({ title, icon, fullHeight, children }: CenteredNoticeProps) {
  const notice = (
    <div className={styles.notice}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h2>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  )
  return fullHeight ? <div className={styles.fullHeight}>{notice}</div> : notice
}

export default CenteredNotice
