import { describe, expect, it } from 'vitest'
import { dayOfYear, formatMonthDay, isMonthDay, parseMonthDay, semesterErrors } from './clubSettingsRules'

describe('semester marks (FR-CLB-03, FR-FIN-12)', () => {
  it('accepts only real dates that repeat every year', () => {
    expect(['01-01', '02-28', '12-31', '04-30'].every(isMonthDay)).toBe(true)
    expect(['02-29', '04-31', '13-01', '00-10', '9-01', '0901', 901, null].some(isMonthDay)).toBe(false)
  })

  it('reads day/month text and shows stored marks as dd/mm', () => {
    expect(parseMonthDay('1/9')).toBe('09-01')
    expect(parseMonthDay(' 15.06 ')).toBe('06-15')
    expect(parseMonthDay('31-12')).toBe('12-31')
    expect([parseMonthDay('29/02'), parseMonthDay('01/13'), parseMonthDay('0109'), parseMonthDay('')]).toEqual([null, null, null, null])
    expect(formatMonthDay('09-01')).toBe('01/09')
  })

  it('counts days from 1 January', () => {
    expect([dayOfYear('01-01'), dayOfYear('03-01'), dayOfYear('12-31')]).toEqual([0, 59, 364])
  })

  it('wants semester 2 and summer in year order after semester 1, across new year', () => {
    const marks = (semester2Start: string, summerStart: string | null) => semesterErrors({ semester1Start: '09-01', semester2Start, summerStart })
    expect(marks('02-01', null)).toEqual([])
    expect(marks('02-01', '07-01')).toEqual([])
    expect(marks('02-01', '08-31')).toEqual([])
    expect(marks('02-01', '01-15')).toEqual([{ field: 'summerStart', message: 'Kỳ hè phải bắt đầu sau học kỳ 2 và trước học kỳ 1 năm sau.' }])
    expect(marks('02-01', '02-01')).toEqual([{ field: 'summerStart', message: 'Các mốc học kỳ phải khác nhau.' }])
    // Học kỳ 1 bắt đầu đầu năm dương lịch vẫn hợp lệ khi ba mốc đi đúng vòng năm.
    expect(semesterErrors({ semester1Start: '01-15', semester2Start: '06-01', summerStart: '09-01' })).toEqual([])
  })
})
