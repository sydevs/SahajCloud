'use client'

import Image, { ImageProps } from 'next/image'

import { useProject } from '@/contexts/ProjectContext'
import { getProjectIcon } from '@/plugins/access'

interface IconProps {
  alt?: string
  size?: number
  style?: ImageProps['style']
}

/**
 * Custom icon component for the Payload admin panel.
 * It shows a project-specific icon at a size the theme controls.
 * When currentProject is null (the admin view), it shows the Sahaj Cloud logo.
 */
const Icon = ({ size = 30, alt = '', style = { borderRadius: '25%' } }: IconProps) => {
  const { currentProject } = useProject()

  const iconSrc = getProjectIcon(currentProject)

  return <Image src={iconSrc} alt={alt} width={size} height={size} style={style} />
}

export default Icon
