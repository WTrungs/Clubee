import { describe, expect, it } from 'vitest'
import { isContactPhone, isEmail, normalizePhone, safeHttpUrl } from './contactRules'

describe('public contact rules (FR-CLB-02)', () => {
  it('only lets http and https links into href', () => {
    expect(safeHttpUrl('https://example.com/clb')).toBe('https://example.com/clb')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('ftp://example.com')).toBeNull()
    expect(safeHttpUrl('https://.abc')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })

  it('checks email addresses', () => {
    expect(isEmail('clb@vidu.com')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('không phải email')).toBe(false)
  })

  it('accepts 10–11 digit phone numbers typed with spaces, dots or dashes', () => {
    expect(normalizePhone(' 028.3725-2002 ')).toBe('02837252002')
    expect(isContactPhone('0901 234 567')).toBe(true)
    expect(isContactPhone('028 3725 2002')).toBe(true)
    expect(isContactPhone('123')).toBe(false)
    expect(isContactPhone('901234567')).toBe(false)
  })
})
