// emails/AdminNotification.tsx
import * as React from 'react'
import {
  Html, Head, Preview, Body, Container, Section, Text, Button, Hr,
} from '@react-email/components'

interface Props {
  name: string
  email: string
  requestedAt: string
  adminUrl: string
  location?: string
}

export default function AdminNotification({ name, email, requestedAt, adminUrl, location }: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>New access request from {name || email}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Text style={s.wordmark}>Conversation Coach</Text>
          <Text style={s.headline}>{`Someone wants\naccess.`}</Text>

          <Section style={s.infoBlock}>
            <Text style={s.infoLabel}>Name</Text>
            <Text style={s.infoValue}>{name || '—'}</Text>
            <Hr style={s.infoSep} />
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoValue}>{email}</Text>
            <Hr style={s.infoSep} />
            <Text style={s.infoLabel}>Requested</Text>
            <Text style={{ ...s.infoValue, color: '#5c5750', fontWeight: 400 }}>{requestedAt}</Text>
            {location && (
              <>
                <Hr style={s.infoSep} />
                <Text style={s.infoLabel}>Location</Text>
                <Text style={{ ...s.infoValue, color: '#5c5750', fontWeight: 400 }}>{location}</Text>
              </>
            )}
          </Section>

          <Section style={s.ctaSection}>
            <Button style={s.button} href={adminUrl}>Review request</Button>
          </Section>

          <Hr style={s.footerDivider} />
          <Text style={s.footer}>Admin notification — Conversation Coach</Text>
        </Container>
      </Body>
    </Html>
  )
}

const s = {
  body: {
    backgroundColor: '#f9f6ef',
    fontFamily: "'Hanken Grotesk', -apple-system, 'Helvetica Neue', Helvetica, sans-serif",
    margin: '0',
    padding: '0',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '52px 52px 44px',
  },
  wordmark: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#a09a8e',
    margin: '0 0 44px',
  },
  headline: {
    fontFamily: "'Source Serif 4', Georgia, serif",
    fontSize: '36px',
    fontWeight: 400,
    lineHeight: '1.15',
    letterSpacing: '-0.015em',
    color: '#1c1912',
    margin: '0',
    whiteSpace: 'pre-line' as const,
  },
  infoBlock: {
    backgroundColor: '#f0ebe0',
    borderRadius: '8px',
    padding: '22px 24px',
    marginTop: '32px',
    maxWidth: '440px',
  },
  infoLabel: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#a09a8e',
    margin: '0 0 2px',
  },
  infoValue: {
    fontSize: '15px',
    fontWeight: 500 as const,
    color: '#1c1912',
    margin: '0',
  },
  infoSep: {
    borderColor: '#e2ddd2',
    margin: '16px 0',
  },
  ctaSection: {
    marginTop: '36px',
  },
  button: {
    backgroundColor: '#6e50c4',
    color: '#fefcf6',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.005em',
    padding: '13px 26px',
    borderRadius: '100px',
    textDecoration: 'none',
    display: 'inline-block' as const,
  },
  footerDivider: {
    borderColor: '#e8e3d8',
    margin: '44px 0 24px',
  },
  footer: {
    fontSize: '11.5px',
    color: '#a09a8e',
    lineHeight: '1.65',
    maxWidth: '440px',
    margin: '0',
  },
}
