// __tests__/components/DropZone.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DropZone } from '@/components/DropZone'

function makeFile(name: string, type: string, size = 100): File {
  return new File(['x'.repeat(size)], name, { type })
}

describe('DropZone — OPUS support', () => {
  it('accepts a .opus file by extension', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('audio.opus', 'audio/ogg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
    expect(screen.queryByText(/unsupported format/i)).toBeNull()
  })

  it('accepts a .opus file with audio/ogg MIME type', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('voice_note.opus', 'audio/ogg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('shows an error for an unsupported format', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('video.mp4', 'video/mp4')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()
  })

  it('still accepts .mp3 files', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('conv.mp3', 'audio/mpeg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('input accept attribute includes .opus', () => {
    render(<DropZone onFile={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain('.opus')
  })

  it('hint text mentions OPUS', () => {
    render(<DropZone onFile={vi.fn()} />)
    expect(screen.getByText(/opus/i)).toBeInTheDocument()
  })
})
