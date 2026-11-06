'use client'

import { usePathname } from 'next/navigation'
import React from 'react'

import { TitledBanner } from '@/components/admin/helpers/TitledBanner'

import styles from './InstallGuide.module.css'

/** The banner itself, which stands down on the Install tab it points at. */
export function InstallBannerNotice(props: {
  installUrl: string
  done: number
  total: number
}): React.ReactElement | null {
  const pathname = usePathname()
  if (pathname?.endsWith('/install')) return null

  return (
    <div className={styles.installBanner}>
      <TitledBanner
        action={<a href={props.installUrl}>Open the Install tab</a>}
        title="The atlas is not fully installed yet"
      >
        {props.done} of {props.total} steps are done. The Install tab walks you through the rest.
      </TitledBanner>
    </div>
  )
}
