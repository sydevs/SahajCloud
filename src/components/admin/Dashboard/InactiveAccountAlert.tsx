'use client'

/**
 * InactiveAccountAlert Component
 *
 * Displayed on dashboard when a manager's account is disabled (active: false).
 * Replaces the entire dashboard with a clear alert message and contact information.
 */
export default function InactiveAccountAlert() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 'var(--base)',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          textAlign: 'center',
          background: 'var(--theme-elevation-50)',
          padding: 'calc(var(--base) * 2.5)',
          borderRadius: 'var(--style-radius-m)',
          border: '2px solid var(--theme-elevation-300)',
        }}
      >
        <div
          style={{
            fontSize: 'calc(var(--base-body-size) * 4px)',
            marginBottom: 'calc(var(--base) * 1.5)',
          }}
        >
          🚫
        </div>
        <h1
          style={{
            fontSize: 'calc(var(--base-body-size) * 2px)',
            fontWeight: 'bold',
            color: 'var(--theme-elevation-900)',
            marginBottom: 'calc(var(--base) * 0.8)',
          }}
        >
          Account Disabled
        </h1>
        <p
          style={{
            fontSize: 'calc(var(--base-body-size) * 1.15px)',
            color: 'var(--theme-elevation-700)',
            lineHeight: '1.6',
            marginBottom: 'calc(var(--base) * 1.5)',
          }}
        >
          Your account has been temporarily disabled. Please contact an administrator for assistance.
        </p>
        <div
          style={{
            background: 'var(--theme-elevation-100)',
            padding: 'calc(var(--base) * 1.2)',
            borderRadius: 'var(--style-radius-s)',
            marginTop: 'var(--base)',
          }}
        >
          <p
            style={{
              fontSize: 'calc(var(--base-body-size) * 0.95px)',
              color: 'var(--theme-elevation-600)',
              margin: 0,
            }}
          >
            Contact:{' '}
            <a
              href="mailto:contact@sydevelopers.com"
              style={{
                color: 'var(--theme-elevation-800)',
                fontWeight: '600',
                textDecoration: 'underline',
              }}
            >
              contact@sydevelopers.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
