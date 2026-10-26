'use client'

import React, { useState } from 'react'

interface FathomDashboardProps {
  siteId: string
  siteName: string
  title: string
}

export default function FathomDashboard({ siteId, siteName, title }: FathomDashboardProps) {
  const [hasError, setHasError] = useState(false)

  const fathomUrl = `https://app.usefathom.com/share/${siteId}/${siteName}`

  const handleError = () => {
    setHasError(true)
  }

  if (hasError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 'calc(var(--base) * 2)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: 'var(--theme-elevation-700)',
            fontSize: 'calc(var(--base-body-size) * 1.2px)',
            marginBottom: 'calc(var(--base) * 1)',
          }}
        >
          Analytics dashboard unavailable
        </div>
        <a
          href={fathomUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--theme-elevation-800)',
            textDecoration: 'underline',
            fontSize: 'calc(var(--base-body-size) * 1px)',
          }}
        >
          Open analytics in new tab →
        </a>
      </div>
    )
  }

  return (
    <iframe
      src={fathomUrl}
      onError={handleError}
      style={{
        width: '100%',
        height: '100vh',
        border: 'none',
      }}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin"
      title={title}
    />
  )
}
