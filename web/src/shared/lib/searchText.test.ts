import { describe, expect, it } from 'vitest'
import { matchesKeyword, normalizeForSearch } from './searchText'

describe('searchText', () => {
  it('strips Vietnamese diacritics including đ', () => {
    expect(normalizeForSearch('Đội Tình nguyện Xanh')).toBe('doi tinh nguyen xanh')
  })

  it('matches regardless of accents and case', () => {
    expect(matchesKeyword('CLB Guitar Sinh viên', 'sinh vien')).toBe(true)
    expect(matchesKeyword('Lê Thu Hà', 'HA')).toBe(true)
    expect(matchesKeyword('Lê Thu Hà', 'hoa')).toBe(false)
  })

  it('treats an empty keyword as match-all', () => {
    expect(matchesKeyword('bất kỳ', '')).toBe(true)
    expect(matchesKeyword('bất kỳ', '   ')).toBe(true)
    expect(matchesKeyword('bất kỳ', null)).toBe(true)
  })
})
