import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import './styles.css'

export default async function HomePage() {
  return (
    <div className="landing-container">
      <div className="landing-content">
        {/* Logo and Title */}
        <div className="logo-section">
          <Image
            src="/images/we-meditate-logo.png"
            alt="We Meditate"
            width={100}
            height={100}
            className="logo"
            priority
          />
          <h1 className="title">We Meditate Admin</h1>
        </div>

        {/* Admin Panel - Primary CTA */}
        <Link href="/admin" className="admin-link">
          <span>Admin Panel</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="icon">
            <path
              d="M5 12h14m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        {/* Service Links */}
        <div className="services">
          <h2 className="services-title">Public Services</h2>

          <a
            href="https://wemeditate.com"
            target="_blank"
            rel="noopener noreferrer"
            className="service-link"
          >
            <span>We Meditate Web</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon">
              <path
                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>

          <div className="app-links">
            <a
              href="https://apps.apple.com/gb/app/we-meditate/id6465684494"
              target="_blank"
              rel="noopener noreferrer"
              className="service-link app-link"
            >
              <span>iOS App</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon">
                <path
                  d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            <a
              href="https://play.google.com/store/apps/details?id=co.wemeditate.sahajaapp"
              target="_blank"
              rel="noopener noreferrer"
              className="service-link app-link"
            >
              <span>Android App</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon">
                <path
                  d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          <a
            href="https://wemeditate.com/map"
            target="_blank"
            rel="noopener noreferrer"
            className="service-link"
          >
            <span>Sahaj Atlas</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon">
              <path
                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>

        {/* Footer */}
        <div className="footer">
          <a
            href="https://www.sydevelopers.com"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Volunteer & Donate →
          </a>
        </div>
      </div>
    </div>
  )
}
