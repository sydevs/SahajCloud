import type { EmailAdapter, Payload, SendEmailOptions } from 'payload'

import { Resend } from 'resend'

import { logger } from '@/lib/logger'

const emailLogger = logger.withContext({ module: 'resend-adapter' })

export const resendAdapter = ({ payload: _payload }: { payload: Payload }): ReturnType<EmailAdapter> => {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    emailLogger.warn('Resend API key not configured - email will not be sent')
  }

  const resend = apiKey ? new Resend(apiKey) : null

  return {
    name: 'resend',
    defaultFromAddress: 'contact@sydevelopers.com',
    defaultFromName: 'We Meditate Admin',

    sendEmail: async (message: SendEmailOptions) => {
      if (!resend) {
        emailLogger.error('Cannot send email - Resend client not initialized')
        return
      }

      try {
        // Convert Payload's SendEmailOptions to Resend's format
        const { data, error } = await resend.emails.send({
          from: (message.from as string) || 'contact@sydevelopers.com',
          to: Array.isArray(message.to) ? (message.to as string[]) : [message.to as string],
          subject: message.subject as string,
          html: message.html as string,
          text: message.text as string,
        })

        if (error) {
          emailLogger.error('Resend API error', undefined, {
            error: error.message,
            name: error.name,
          })
          return
        }

        if (data) {
          emailLogger.info('Email sent successfully', { messageId: data.id })
        }
      } catch (error) {
        emailLogger.error(
          'Email sending failed',
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    },
  }
}
