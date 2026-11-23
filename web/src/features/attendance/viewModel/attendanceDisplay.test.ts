import { describe, expect, it } from 'vitest'
import type { AttendanceAction } from '../model/attendanceTypes'
import { attendanceFilters, attendanceNotice, attendanceWindow, closeConfirmText, dayLabel, editWindowText, qrProgressText, secondsLeft } from './attendanceDisplay'

const sheet = {
  opensAt: '2026-11-10T17:45:00+07:00',
  closedAt: null,
  closedBy: null,
  readOnlyReason: null,
  editableUntil: null,
  allowedActions: [] as AttendanceAction[],
}

describe('attendanceDisplay', () => {
  it('tells which part of the attendance window we are in', () => {
    expect(attendanceWindow(sheet, Date.parse('2026-11-10T17:44:00+07:00'))).toBe('NOT_OPEN')
    expect(attendanceWindow(sheet, Date.parse('2026-11-10T17:45:00+07:00'))).toBe('OPEN')
    expect(attendanceWindow({ ...sheet, closedAt: '2026-11-10T20:00:00+07:00' }, Date.now())).toBe('CLOSED')
    expect(attendanceWindow({ ...sheet, readOnlyReason: 'Sự kiện đã đóng.' }, Date.now())).toBe('READ_ONLY')
  })

  it('writes the notice with Vietnamese date and time', () => {
    expect(attendanceNotice(sheet, Date.parse('2026-11-10T12:00:00+07:00'))).toBe('Điểm danh mở lúc 17:45, 10/11/2026.')
    expect(attendanceNotice({ ...sheet, closedAt: '2026-11-10T20:15:00+07:00', closedBy: { id: 'u-linh', fullName: 'Đặng Khánh Linh' } }, Date.now())).toBe(
      'Đã chốt lúc 10/11/2026 20:15 bởi Đặng Khánh Linh. Danh sách chỉ xem được.',
    )
  })

  it('states the edit window after closing (FR-ATT-08, BR-ATT-04)', () => {
    const closed = { ...sheet, closedAt: '2026-11-10T20:15:00+07:00', closedBy: null, editableUntil: '2026-11-12T20:15:00+07:00' }
    const before = Date.parse('2026-11-12T20:14:00+07:00')
    const after = Date.parse('2026-11-12T20:15:00+07:00')
    expect(editWindowText({ ...closed, allowedActions: ['EDIT'] }, before)).toBe('Sửa được đến 12/11/2026 20:15, mỗi lần sửa cần lý do.')
    expect(editWindowText({ ...closed, allowedActions: ['EDIT'] }, after)).toBe('Đã quá hạn sửa (12/11/2026 20:15); ban chủ nhiệm vẫn sửa được, mỗi lần sửa cần lý do.')
    expect(editWindowText(closed, after)).toBe('Đã quá hạn sửa (12/11/2026 20:15); chỉ ban chủ nhiệm sửa được.')
    // Người xem được mà không sửa được (ví dụ nhân sự tiểu ban) còn trong hạn: không báo nhầm là đã quá hạn.
    expect(editWindowText(closed, before)).toBe('Danh sách chỉ xem được; người chốt và ban chủ nhiệm sửa được đến 12/11/2026 20:15.')
    expect(attendanceNotice({ ...closed, allowedActions: ['EDIT'] }, before)).toBe('Đã chốt lúc 10/11/2026 20:15. Sửa được đến 12/11/2026 20:15, mỗi lần sửa cần lý do.')
    expect(attendanceNotice({ ...sheet, readOnlyReason: 'Sự kiện đã đóng nên điểm danh chỉ xem được.' }, Date.now())).toBe('Sự kiện đã đóng nên điểm danh chỉ xem được.')
  })

  it('counts every filter and states how many people closing marks absent', () => {
    const counts = { expected: 10, present: 4, late: 1, excused: 1, absent: 0, unmarked: 4, unmarkedExcused: 0, extra: 2 }
    expect(attendanceFilters(counts).map((item) => [item.value, item.count])).toEqual([
      ['', 12],
      ['UNMARKED', 4],
      ['PRESENT', 4],
      ['LATE', 1],
      ['EXCUSED', 1],
      ['ABSENT', 0],
      ['EXTRA', 2],
    ])
    expect(closeConfirmText({ unmarked: 4, unmarkedExcused: 0 })).toBe('4 người chưa điểm danh sẽ được ghi Vắng không phép. Sau khi chốt, danh sách chỉ xem được.')
    expect(closeConfirmText({ unmarked: 0, unmarkedExcused: 0 })).toBe('Mọi người trong danh sách đã có trạng thái. Sau khi chốt, danh sách chỉ xem được.')
    // FR-ATT-04: người có đơn đã duyệt được ghi Vắng có phép.
    expect(closeConfirmText({ unmarked: 4, unmarkedExcused: 1 })).toBe(
      '3 người chưa điểm danh sẽ được ghi Vắng không phép; 1 người có đơn xin phép đã duyệt sẽ được ghi Vắng có phép. Sau khi chốt, danh sách chỉ xem được.',
    )
    expect(closeConfirmText({ unmarked: 2, unmarkedExcused: 2 })).toBe('2 người có đơn xin phép đã duyệt sẽ được ghi Vắng có phép. Sau khi chốt, danh sách chỉ xem được.')
  })

  it('labels the days of a multi-day event', () => {
    expect(dayLabel('2026-11-08', 1)).toBe('Ngày 2 · 08/11')
  })

  it('counts down whole seconds until the QR code changes, never below zero', () => {
    const expiresAt = Date.parse('2026-11-10T18:00:30+07:00')
    expect(secondsLeft(expiresAt, Date.parse('2026-11-10T18:00:00+07:00'))).toBe(30)
    expect(secondsLeft(expiresAt, Date.parse('2026-11-10T18:00:29.200+07:00'))).toBe(1)
    expect(secondsLeft(expiresAt, Date.parse('2026-11-10T18:00:30+07:00'))).toBe(0)
    expect(secondsLeft(expiresAt, Date.parse('2026-11-10T18:01:00+07:00'))).toBe(0)
  })

  it('sums present and late people next to the QR code', () => {
    expect(qrProgressText({ present: 3, late: 1, unmarked: 5 })).toBe('4 người có mặt · 5 người chưa điểm danh')
  })
})
