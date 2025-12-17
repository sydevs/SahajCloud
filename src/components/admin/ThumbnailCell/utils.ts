/**
 * Calculate dimensions based on aspect ratio and size
 */
export const getThumbnailDimensions = (
  aspectRatio: string,
  size: 'small' | 'medium' | 'large',
) => {
  if (aspectRatio === '16:9') {
    switch (size) {
      case 'small':
        return { width: '60px', height: '34px' }
      case 'large':
        return { width: '120px', height: '67.5px' }
      case 'medium':
      default:
        return { width: '80px', height: '45px' }
    }
  }
  // Default 1:1
  switch (size) {
    case 'small':
      return { width: '40px', height: '40px' }
    case 'large':
      return { width: '80px', height: '80px' }
    case 'medium':
    default:
      return { width: '60px', height: '60px' }
  }
}
