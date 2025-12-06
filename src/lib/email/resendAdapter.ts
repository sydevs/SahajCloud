import type { EmailAdapter } from 'payload'

import { Resend } from 'resend'

export const resendAdapter = (): EmailAdapter => {
  return ({ payload }) => {
    const apiKey = process.env.RESEND_API_KEY

    if (!apiKey) {
      payload.logger.warn({ msg: 'Resend API key not configured - email will not be sent' })
    }

    const resend = apiKey ? new Resend(apiKey) : null

    return {
      name: 'resend',
      defaultFromAddress: 'contact@sydevelopers.com',
      defaultFromName: 'We Meditate Admin',

      async sendEmail(message) {
        if (!resend) {
          payload.logger.error({ msg: 'Cannot send email - Resend client not initialized' })
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
            payload.logger.error({
              msg: 'Resend API error',
              error: error.message,
              name: error.name,
            })
            return
          }

          if (data) {
            payload.logger.info({ msg: 'Email sent successfully', messageId: data.id })
          }
        } catch (error) {
          payload.logger.error({
            msg: 'Email sending failed',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    }
  }
}
