'use client'

import Link from 'next/link'
import React from 'react'

interface QuickLinkProps {
  title: string
  description: string
  href: string
}

/**
 * Quick Link Card Component
 */
function QuickLinkCard({ title, description, href }: QuickLinkProps) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: 'calc(var(--base) * 1.5)',
        backgroundColor: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-100)',
        borderRadius: 'var(--style-radius-m)',
        textDecoration: 'none',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
        e.currentTarget.style.borderColor = 'var(--theme-elevation-200)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--theme-elevation-50)'
        e.currentTarget.style.borderColor = 'var(--theme-elevation-100)'
      }}
    >
      <div style={{
        fontSize: 'calc(var(--base-body-size) * 1.2px)',
        color: 'var(--theme-elevation-800)',
        marginBottom: 'calc(var(--base) * 0.5)',
        fontWeight: 'bold',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 'calc(var(--base-body-size) * 1px)',
        color: 'var(--theme-elevation-600)',
        lineHeight: '1.5',
      }}>
        {description}
      </div>
    </Link>
  )
}

/**
 * Default Dashboard Component
 *
 * Displays a simple dashboard with quick links to key collections
 * for the "All Content" project view.
 */
export default function DefaultDashboard() {
  return (
    <div style={{
      padding: 'calc(var(--base) * 2)',
    }}>
      {/* Header */}
      <div style={{
        marginBottom: 'calc(var(--base) * 2)',
        paddingBottom: 'calc(var(--base) * 1)',
        borderBottom: '1px solid var(--theme-elevation-100)',
      }}>
        <h1 style={{
          fontSize: 'calc(var(--base-body-size) * 1.8px)',
          fontWeight: 'bold',
          color: 'var(--theme-elevation-800)',
          margin: 0,
          marginBottom: 'calc(var(--base) * 0.5)',
        }}>
          Welcome to We Meditate Admin
        </h1>
        <div style={{
          fontSize: 'calc(var(--base-body-size) * 1px)',
          color: 'var(--theme-elevation-600)',
        }}>
          Manage content across all projects
        </div>
      </div>

      {/* Quick Links Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 'calc(var(--base) * 1.5)',
        marginBottom: 'calc(var(--base) * 3)',
      }}>
        <QuickLinkCard
          title="Meditations"
          description="Manage guided meditation content with audio files and frames"
          href="/admin/collections/meditations"
        />

        <QuickLinkCard
          title="Path Steps"
          description="Manage meditation lessons and learning path content"
          href="/admin/collections/lessons"
        />

        <QuickLinkCard
          title="Pages"
          description="Manage articles, techniques, and other page content"
          href="/admin/collections/pages"
        />

        <QuickLinkCard
          title="Music"
          description="Manage background music tracks for meditations"
          href="/admin/collections/music"
        />

        <QuickLinkCard
          title="Media"
          description="Manage images and media files"
          href="/admin/collections/media"
        />

        <QuickLinkCard
          title="External Videos"
          description="Manage external video content and metadata"
          href="/admin/collections/external-videos"
        />
      </div>

      {/* Info Section */}
      <div style={{
        padding: 'calc(var(--base) * 1.5)',
        backgroundColor: 'var(--theme-elevation-50)',
        borderLeft: '3px solid var(--theme-elevation-400)',
        borderRadius: 'var(--style-radius-s)',
        fontSize: 'calc(var(--base-body-size) * 0.9px)',
        color: 'var(--theme-elevation-600)',
      }}>
        <strong>Tip:</strong> Use the project selector at the top of the sidebar to switch between different project views (We Meditate Web, We Meditate App, Sahaj Atlas) for a more focused experience.
      </div>
    </div>
  )
}
