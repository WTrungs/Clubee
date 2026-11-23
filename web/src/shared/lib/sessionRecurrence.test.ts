import { describe, expect, it } from 'vitest'
import { recurrenceDays, recurrenceError, SERIES_MAX_SESSIONS, seriesTimes, shiftVnIso, vnDayOf } from './sessionRecurrence'

describe('recurrence days (FR-ATT-02)', () => {
  it('repeats weekly up to and including the last day', () => {
    expect(recurrenceDays('2026-12-01', 'WEEKLY', '2026-12-22')).toEqual(['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22'])
    expect(recurrenceDays('2026-12-01', 'WEEKLY', '2026-12-21')).toHaveLength(3)
  })

  it('repeats monthly on the same date and skips months without it', () => {
    expect(recurrenceDays('2027-01-31', 'MONTHLY', '2027-06-30')).toEqual(['2027-01-31', '2027-03-31', '2027-05-31'])
    expect(recurrenceDays('2028-01-29', 'MONTHLY', '2028-03-29')).toEqual(['2028-01-29', '2028-02-29', '2028-03-29'])
    expect(recurrenceDays('2027-01-29', 'MONTHLY', '2027-03-29')).toEqual(['2027-01-29', '2027-03-29'])
  })

  it('explains what is wrong with a series', () => {
    expect(recurrenceError('2026-12-01', 'WEEKLY', '2026-12-31')).toBeNull()
    expect(recurrenceError('2026-12-01', 'WEEKLY', '2026-02-30')).toBe('Ngày kết thúc chuỗi không hợp lệ.')
    expect(recurrenceError('2026-12-01', 'WEEKLY', '2026-12-01')).toBe('Ngày kết thúc chuỗi phải sau ngày của buổi đầu.')
    expect(recurrenceError('2026-12-01', 'WEEKLY', '2026-12-05')).toBe('Chuỗi cần ít nhất 2 buổi; chọn ngày kết thúc xa hơn.')
    expect(recurrenceError('2026-12-01', 'MONTHLY', '2028-01-01')).toBe('Chuỗi kéo dài tối đa một năm.')
    // 53 tuần nằm trong một năm 366 ngày.
    expect(recurrenceError('2027-01-01', 'WEEKLY', '2027-12-31')).toBe(`Một chuỗi tối đa ${SERIES_MAX_SESSIONS} buổi.`)
    expect(recurrenceError('2027-01-01', 'WEEKLY', '2027-12-24')).toBeNull()
  })
})

describe('series times', () => {
  it('keeps the clock time, length and registration offset of the first session', () => {
    const times = seriesTimes(
      { startAt: '2026-12-01T18:30:00+07:00', endAt: '2026-12-01T20:30:00+07:00', registrationDeadline: '2026-11-30T23:00:00+07:00' },
      ['2026-12-01', '2026-12-08'],
    )
    expect(times[1]).toEqual({ startAt: '2026-12-08T18:30:00+07:00', endAt: '2026-12-08T20:30:00+07:00', registrationDeadline: '2026-12-07T23:00:00+07:00' })
  })

  it('reads and shifts Vietnam dates across midnight UTC', () => {
    expect(vnDayOf('2026-12-01T00:30:00+07:00')).toBe('2026-12-01')
    expect(shiftVnIso('2026-12-31T23:00:00+07:00', 1)).toBe('2027-01-01T23:00:00+07:00')
  })
})
