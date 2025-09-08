import React from 'react'
import Link from 'next/link'

import './styles.css'

export default async function HomePage() {
  return (
    <div className="splash-container">
      <div className="animated-bg">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>

      <div className="splash-content">
        <div className="logo-container">
          <div className="logo-shape">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <h1 className="splash-title">
          <span className="title-word">Sahaj</span>
          <span className="title-word cloud">Cloud</span>
          <span className="title-word cms">CMS</span>
        </h1>

        <Link href="/admin" className="admin-button">
          <span className="button-text">Enter Admin Panel</span>
          <svg
            className="button-arrow"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 12h14m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <div className="splash-footer">
        <p className="copyright">Powered by Payload CMS</p>
      </div>
    </div>
  )
}
