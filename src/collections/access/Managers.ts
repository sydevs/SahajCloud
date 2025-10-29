import { adminOnlyAccess, createPermissionsField } from '@/lib/accessControl'
import type { CollectionConfig } from 'payload'

export const Managers: CollectionConfig = {
  slug: 'managers',
  access: adminOnlyAccess(),
  auth: {
    verify: {
      generateEmailHTML: ({ token, user }) => {
        const verifyURL = `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/admin/verify/${token}`
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #F07855 0%, #FF9477 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">We Meditate Admin</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #F07855; margin-top: 0;">Verify Your Email Address</h2>
    <p>Hello <strong>${user.name || user.email}</strong>,</p>
    <p>Thank you for creating an account with We Meditate Admin. To complete your registration and access the admin panel, please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyURL}" style="background: linear-gradient(135deg, #F07855 0%, #FF9477 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyURL}" style="color: #F07855; word-break: break-all;">${verifyURL}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; margin: 0;">
      If you didn't create this account, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
        `.trim()
      },
      generateEmailSubject: () => 'Verify Your Email - We Meditate Admin',
    },
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    hidden: ({ user }) => !user?.admin,
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', '_verified', 'active', 'admin'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'admin',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Admin users bypass all permission restrictions and have complete access to all collections and features.',
      },
    },
    createPermissionsField({ excludedLevels: ['read'] }),
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable or disable this user',
      },
    },
  ],
}
