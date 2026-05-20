// lib/email.tsx
import * as React from 'react'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import AdminNotification from '@/emails/AdminNotification'
import AccessDenied from '@/emails/AccessDenied'
import { log } from '@/lib/logger'

function getResend() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Resend as any)(process.env.RESEND_API_KEY)
}

function getFrom() {
  return process.env.RESEND_FROM_EMAIL ?? 'noreply@conversationcoach.app'
}

export async function sendAdminNotification({
  name,
  email,
  requestedAt,
}: {
  name: string
  email: string
  requestedAt: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    log.warn('email: RESEND_API_KEY not set — skipping admin notification')
    return
  }
  try {
    const html = await render(
      <AdminNotification
        name={name}
        email={email}
        requestedAt={requestedAt}
        adminUrl={`${process.env.APP_URL ?? ''}/admin`}
      />
    )
    await getResend().emails.send({
      from: getFrom(),
      to: process.env.NEXT_PUBLIC_OWNER_EMAIL!,
      subject: `New access request from ${name || email}`,
      html,
    })
    log.info('email: admin notification sent', { email })
  } catch (err) {
    log.error('email: admin notification failed', { email, err })
  }
}

export async function sendAccessDenied({ to }: { to: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    log.warn('email: RESEND_API_KEY not set — skipping access denied email')
    return
  }
  try {
    const html = await render(
      <AccessDenied ownerEmail={process.env.NEXT_PUBLIC_OWNER_EMAIL!} />
    )
    await getResend().emails.send({
      from: getFrom(),
      to,
      subject: 'Your Conversation Coach access request',
      html,
    })
    log.info('email: access denied sent', { to })
  } catch (err) {
    log.error('email: access denied failed', { to, err })
  }
}
