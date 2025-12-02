'use client'

import Image, { ImageProps } from 'next/image'

import { useProject } from '@/contexts/ProjectContext'

/**
 * Project-specific icon paths
 */
const PROJECT_ICONS: Record<string, string> = {
  'all-content': '/images/sahaj-cloud.svg',
  'wemeditate-web': '/images/wemeditate-web.svg',
  'wemeditate-app': '/images/wemeditate-app.svg',
  'sahaj-atlas': '/images/sahaj-atlas.webp',
}

interface IconProps {
  alt?: string
  size?: number
  style?: ImageProps['style']
}

/**
 * Custom Icon component for Payload admin panel
 * Displays project-specific icon with theme-adaptive sizing
 */
const Icon = ({ size = 30, alt = '', style = { borderRadius: '25%' } }: IconProps) => {
  const { currentProject } = useProject()
  const iconSrc = PROJECT_ICONS[currentProject] || PROJECT_ICONS['all-content']

  return <Image src={iconSrc} alt={alt} width={size} height={size} style={style} />
}

export default Icon
