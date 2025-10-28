'use client'

import Image from 'next/image'

/**
 * Custom Logo component for Payload admin panel
 * Displays the We Meditate coral square logo on login/signup pages
 */
const Logo = () => {
  return (
    <Image
      src="/images/we-meditate-logo.png"
      alt="We Meditate"
      width={200}
      height={200}
      style={{
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
      }}
      priority
    />
  )
}

export default Logo
