import React from 'react'

// Initialize client-side Sentry for error tracking
import '@/lib/sentry/client'

import './styles.css'

export const metadata = {
  description: 'A CMS for all We Meditate related services.',
  title: 'We Meditate Admin',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
