import { describe, expect, it } from 'vitest'
import { imageContentType, validateImageFile } from './validateImageFile'

describe('image file (IF-05)', () => {
  it('accepts JPG and PNG up to 15 MB only', () => {
    expect(validateImageFile({ name: 'anh.png', size: 1000, type: 'image/png' }, 'Ảnh đại diện')).toBeNull()
    expect(validateImageFile({ name: 'anh.JPG', size: 1000, type: '' }, 'Ảnh đại diện')).toBeNull()
    expect(validateImageFile({ name: 'cv.pdf', size: 1000, type: 'application/pdf' }, 'Logo CLB')).toBe('Logo CLB chỉ nhận tệp JPG hoặc PNG.')
    expect(validateImageFile({ name: 'anh.png', size: 16 * 1024 * 1024, type: 'image/png' }, 'Ảnh')).toContain('15 MB')
    expect(validateImageFile({ name: 'anh.png', size: 0, type: 'image/png' }, 'Ảnh')).toContain('rỗng')
  })

  it('rejects a file whose type and extension disagree', () => {
    expect(validateImageFile({ name: 'cv.pdf', size: 1000, type: 'image/png' }, 'Ảnh')).not.toBeNull()
    expect(validateImageFile({ name: 'anh.png', size: 1000, type: 'image/jpeg' }, 'Ảnh')).not.toBeNull()
    expect(imageContentType('logo.jpeg')).toBe('image/jpeg')
    expect(imageContentType('logo.gif')).toBeNull()
  })
})
