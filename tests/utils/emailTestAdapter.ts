import type { Transporter } from 'nodemailer'
import type { Address } from 'nodemailer/lib/mailer'

import nodemailer from 'nodemailer'

/**
 * In-memory email adapter for integration tests.
 *
 * This used to provision a real Ethereal inbox in `init()` via
 * `nodemailer.createTestAccount()` — a live network call on every run of the two
 * specs that use it, which made an ethereal.email outage look like a test
 * failure in our own code. Nothing ever read the resulting inbox: assertions go
 * through `getCapturedEmails()`.
 *
 * It now uses nodemailer's `streamTransport`, which composes the message exactly
 * as a real transport would (so header/MIME bugs still surface) but writes it to
 * a buffer instead of a socket. Same capture API, no network, no credentials.
 */

export interface CapturedEmail {
  to: string | string[]
  from: string
  subject: string
  html?: string
  text?: string
  sentAt: Date
}

export class EmailTestAdapter {
  private transporter: Transporter | null = null
  private capturedEmails: CapturedEmail[] = []
  public account: {
    user: string
    pass: string
    web: string
  }
  
  // Create function that returns email adapter configuration
  static create(adapter?: EmailTestAdapter): () => {
    defaultFromAddress: string
    defaultFromName: string
    name: string
    sendEmail: (options: any) => Promise<any>
    adapter: EmailTestAdapter
  } {
    const instance = adapter || new EmailTestAdapter()
    return () => ({
      defaultFromAddress: 'no-reply@test.local',
      defaultFromName: 'Test Email Adapter',
      name: 'in-memory',
      sendEmail: instance.sendEmail.bind(instance),
      adapter: instance // Keep reference to adapter for testing
    })
  }

  constructor() {
    this.account = {
      user: '',
      pass: '',
      web: '',
    }
  }

  /**
   * Build the in-memory transport. Kept `async` because callers await it and
   * because the previous implementation genuinely was.
   */
  async init(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    })
  }

  async sendEmail(options: { to?: string | Address | (string | Address)[]; from?: string | Address; subject?: string; html?: string | Buffer; text?: string | Buffer; }): Promise<any> {
    const { to, from, subject, html, text } = options

    if (!this.transporter) {
      throw new Error('Email adapter not initialized. Call init() first.')
    }

    try {
      // Compose through the real nodemailer path so MIME/header problems still
      // surface; streamTransport buffers the result rather than sending it.
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text,
      })

      // Capture email for testing after successful send
      const capturedTo = Array.isArray(to) 
        ? to.map(t => typeof t === 'string' ? t : t.address || '').join(', ')
        : typeof to === 'string' ? to : to?.address || ''
      
      const capturedFrom = typeof from === 'string' ? from : from?.address || ''
      
      this.capturedEmails.push({
        to: capturedTo,
        from: capturedFrom,
        subject: subject || '',
        html: typeof html === 'string' ? html : undefined,
        text: typeof text === 'string' ? text : undefined,
        sentAt: new Date(),
      })

      return info
    } catch (error) {
      console.error('Error sending email:', error)
      throw error
    }
  }

  getCapturedEmails(): CapturedEmail[] {
    return this.capturedEmails
  }

  clearCapturedEmails(): void {
    this.capturedEmails = []
  }

  getLatestEmail(): CapturedEmail | undefined {
    return this.capturedEmails[this.capturedEmails.length - 1]
  }

  findEmailByTo(recipient: string): CapturedEmail | undefined {
    return this.capturedEmails.find(email => {
      const recipients = Array.isArray(email.to) ? email.to : [email.to]
      return recipients.includes(recipient)
    })
  }

  async waitForEmail(timeout: number = 5000): Promise<CapturedEmail> {
    const startTime = Date.now()
    const initialCount = this.capturedEmails.length
    
    while (Date.now() - startTime < timeout) {
      if (this.capturedEmails.length > initialCount) {
        return this.capturedEmails[this.capturedEmails.length - 1]
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    throw new Error(`No email captured within ${timeout}ms. Current count: ${this.capturedEmails.length}`)
  }
}