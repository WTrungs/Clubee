import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  describeDueDate,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatTime,
  parseVnDate,
  parseVnDateTime,
} from './formatDate'

describe('formatDate', () => {
  it('formats as dd/mm/yyyy in UTC+7 regardless of the input offset', () => {
    // 2026-10-31T20:30Z is already 01/11 in Vietnam.
    expect(formatDate('2026-10-31T20:30:00Z')).toBe('01/11/2026')
    expect(formatDate('2026-03-05T08:00:00+07:00')).toBe('05/03/2026')
  })

  it('formats time with a 24-hour clock', () => {
    expect(formatTime('2026-10-31T11:05:00Z')).toBe('18:05')
    expect(formatTime('2026-10-31T17:00:00Z')).toBe('00:00')
  })

  it('joins date and time', () => {
    expect(formatDateTime('2026-11-02T18:30:00+07:00')).toBe('02/11/2026 18:30')
  })

  it('prefixes a capitalised Vietnamese weekday', () => {
    expect(formatLongDate('2026-11-02T09:00:00+07:00')).toBe('Thứ Hai, 02/11/2026')
  })
})

describe('invalid input', () => {
  it('shows a dash instead of throwing while rendering', () => {
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatTime('')).toBe('—')
    expect(formatDateTime('2026-13-45')).toBe('—')
    expect(formatLongDate('x')).toBe('—')
    expect(describeDueDate('x')).toBe('—')
  })
})

describe('daysUntil / describeDueDate', () => {
  const now = new Date('2026-10-31T10:00:00+07:00')

  it('counts calendar days in Vietnam time', () => {
    expect(daysUntil('2026-10-31T23:59:00+07:00', now)).toBe(0)
    expect(daysUntil('2026-11-01T00:01:00+07:00', now)).toBe(1)
    expect(daysUntil('2026-10-29T12:00:00+07:00', now)).toBe(-2)
  })

  it('describes the due date', () => {
    expect(describeDueDate('2026-10-31T20:00:00+07:00', now)).toBe('Hôm nay')
    expect(describeDueDate('2026-11-01T08:00:00+07:00', now)).toBe('Ngày mai')
    expect(describeDueDate('2026-11-04T08:00:00+07:00', now)).toBe('Còn 4 ngày')
    expect(describeDueDate('2026-10-30T08:00:00+07:00', now)).toBe('Quá hạn 1 ngày')
  })
})

describe('parseVnDateTime', () => {
  it('builds an ISO string with the +07:00 offset', () => {
    expect(parseVnDateTime('02/11/2026', '18:30')).toBe('2026-11-02T18:30:00+07:00')
  })

  it('trims surrounding spaces', () => {
    expect(parseVnDateTime(' 02/11/2026 ', ' 08:05 ')).toBe('2026-11-02T08:05:00+07:00')
  })

  it('rejects wrong formats and impossible dates', () => {
    expect(parseVnDateTime('2026-11-02', '18:30')).toBeNull()
    expect(parseVnDateTime('2/11/2026', '18:30')).toBeNull()
    expect(parseVnDateTime('31/02/2026', '10:00')).toBeNull()
    expect(parseVnDateTime('02/11/2026', '24:00')).toBeNull()
    expect(parseVnDateTime('02/13/2026', '10:00')).toBeNull()
  })
})

describe('parseVnDate', () => {
  it('turns a dd/mm/yyyy field into the API date and rejects days that do not exist', () => {
    expect(parseVnDate('04/11/2026')).toBe('2026-11-04')
    expect(parseVnDate(' 29/02/2028 ')).toBe('2028-02-29')
    expect(parseVnDate('31/11/2026')).toBeNull()
    expect(parseVnDate('2026-11-04')).toBeNull()
  })
})
