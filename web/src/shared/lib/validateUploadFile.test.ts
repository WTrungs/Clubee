import { describe, expect, it } from 'vitest'
import { formatFileSize, MAX_UPLOAD_BYTES, validateUploadFile } from './validateUploadFile'

const file = (name: string, size: number, type = '') => ({ name, size, type })

describe('validateUploadFile', () => {
  it('accepts the six allowed formats', () => {
    expect(validateUploadFile(file('anh.JPG', 1000, 'image/jpeg')).ok).toBe(true)
    expect(validateUploadFile(file('poster.png', 1000, 'image/png')).ok).toBe(true)
    expect(validateUploadFile(file('ke-hoach.pdf', 1000, 'application/pdf')).ok).toBe(true)
    expect(validateUploadFile(file('bao-cao.docx', 1000)).ok).toBe(true)
    expect(validateUploadFile(file('du-toan.xlsx', 1000)).ok).toBe(true)
    expect(validateUploadFile(file('slide.pptx', 1000)).ok).toBe(true)
  })

  it('rejects other formats and mismatched types', () => {
    expect(validateUploadFile(file('virus.exe', 1000)).ok).toBe(false)
    expect(validateUploadFile(file('khong-duoi', 1000)).ok).toBe(false)
    expect(validateUploadFile(file('anh.gif', 1000, 'image/gif')).ok).toBe(false)
    expect(validateUploadFile(file('gia.pdf', 1000, 'application/x-msdownload')).ok).toBe(false)
  })

  it('enforces the 15 MB limit and rejects empty files', () => {
    expect(validateUploadFile(file('to.pdf', MAX_UPLOAD_BYTES)).ok).toBe(true)
    const tooBig = validateUploadFile(file('to.pdf', MAX_UPLOAD_BYTES + 1))
    expect(tooBig.ok).toBe(false)
    if (!tooBig.ok) expect(tooBig.message).toContain('15 MB')
    expect(validateUploadFile(file('rong.pdf', 0)).ok).toBe(false)
  })
})

describe('formatFileSize', () => {
  it('uses B, KB and MB with a comma decimal', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3,5 MB')
  })
})
