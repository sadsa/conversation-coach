import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PendingUploadCard } from '@/components/PendingUploadCard'

function makeFile(name: string, size: number): File {
  return new File(['x'.repeat(size)], name, { type: 'audio/ogg' })
}

const baseProps = {
  file: makeFile('PTT-20260327.opus', 1200000),
  speakerMode: 'solo' as const,
  speakersExpected: 2,
  onModeChange: vi.fn(),
  onSpeakersChange: vi.fn(),
  onConfirm: vi.fn(),
  onDismiss: vi.fn(),
}

describe('PendingUploadCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays the file name', () => {
    render(<PendingUploadCard {...baseProps} />)
    expect(screen.getByText('PTT-20260327.opus')).toBeInTheDocument()
  })

  it('displays file size in MB', () => {
    render(<PendingUploadCard {...baseProps} />)
    expect(screen.getByText(/1\.1 MB/i)).toBeInTheDocument()
  })

  it('calls onModeChange when Conversation is clicked', () => {
    const onModeChange = vi.fn()
    render(<PendingUploadCard {...baseProps} onModeChange={onModeChange} />)
    fireEvent.click(screen.getByText('Conversation'))
    expect(onModeChange).toHaveBeenCalledWith('conversation')
  })

  it('calls onModeChange when Solo is clicked', () => {
    const onModeChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onModeChange={onModeChange} />)
    fireEvent.click(screen.getByText('Solo'))
    expect(onModeChange).toHaveBeenCalledWith('solo')
  })

  it('hides speaker count pills when Solo is selected', () => {
    render(<PendingUploadCard {...baseProps} speakerMode="solo" />)
    expect(screen.queryByText('Speakers:')).toBeNull()
  })

  it('shows speaker count pills when Conversation is selected', () => {
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" />)
    expect(screen.getByText('Speakers:')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5+')).toBeInTheDocument()
  })

  it('calls onSpeakersChange with 5 when 5+ is clicked', () => {
    const onSpeakersChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onSpeakersChange={onSpeakersChange} />)
    fireEvent.click(screen.getByText('5+'))
    expect(onSpeakersChange).toHaveBeenCalledWith(5)
  })

  it('calls onSpeakersChange with the correct number when a pill is clicked', () => {
    const onSpeakersChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onSpeakersChange={onSpeakersChange} />)
    fireEvent.click(screen.getByText('3'))
    expect(onSpeakersChange).toHaveBeenCalledWith(3)
  })

  it('calls onDismiss when Dismiss is clicked', () => {
    const onDismiss = vi.fn()
    render(<PendingUploadCard {...baseProps} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onConfirm when Upload is clicked', () => {
    const onConfirm = vi.fn()
    render(<PendingUploadCard {...baseProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText(/Upload/))
    expect(onConfirm).toHaveBeenCalled()
  })
})
