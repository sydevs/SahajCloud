'use client'

import Image, { ImageProps } from 'next/image'

import { useProject } from '@/contexts/ProjectContext'
import { PROJECT_ICONS } from '@/lib/projects'

interface IconProps {
  alt?: string
  size?: number
  style?: ImageProps['style']
}

/**
 * Custom Icon component for Payload admin panel
 * Displays project-specific icon with theme-adaptive sizing
 * Handles null currentProject (admin view) by showing Sahaj Cloud logo
 */
const Icon = ({ size = 30, alt = '', style = { borderRadius: '25%' } }: IconProps) => {
  const { currentProject } = useProject()

  // Get icon for current project, fallback to sahaj-cloud (admin view)
  const iconSrc = PROJECT_ICONS[currentProject || 'sahaj-cloud']

  return <Image src={iconSrc} alt={alt} width={size} height={size} style={style} />
}

export default Icon
