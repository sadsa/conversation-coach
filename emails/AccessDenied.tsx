// emails/AccessDenied.tsx
import * as React from 'react'
import {
  Html, Head, Preview, Body, Container, Section, Text, Link, Hr,
} from '@react-email/components'

interface Props {
  ownerEmail: string
}

export default function AccessDenied({ ownerEmail }: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your Conversation Coach access request</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Text style={s.wordmark}>Conversation Coach</Text>
          <Text style={s.headline}>{`We can't add\nyou right now.`}</Text>
          <Text style={s.bodyText}>If this is a mistake, get in touch.</Text>

          <Section style={s.contactSection}>
            <Link href={`mailto:${ownerEmail}`} style={s.contactLink}>{ownerEmail}</Link>
          </Section>

          <Hr style={s.footerDivider} />
          <Text style={s.footer}>You requested access to Conversation Coach.</Text>
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
    margin: '0 0 18px',
    whiteSpace: 'pre-line' as const,
  },
  bodyText: {
    fontSize: '16px',
    color: '#5c5750',
    lineHeight: '1.65',
    maxWidth: '440px',
    margin: '0',
  },
  contactSection: {
    marginTop: '32px',
  },
  contactLink: {
    fontSize: '14px',
    color: '#6e50c4',
    textDecoration: 'none',
  },
  footerDivider: {
    borderColor: '#e8e3d8',
    margin: '44px 0 24px',
  },
  footer: {
    fontSize: '11.5px',
    color: '#a09a8e',
    lineHeight: '1.65',
    margin: '0',
  },
}
