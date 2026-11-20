import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'

const HOUR_MS = 60 * 60 * 1000
const PHOTO = { type: 'SESSION' as const, clubId: 'c-guitar', id: 's-media-photo' }
const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
/** Đặt lúc chốt của buổi chụp ảnh (người chốt: Trưởng ban Linh) cách hiện tại một số giờ. */
const closedHoursAgo = (hours: number) => {
  const sheet = db.attendanceSheets.find((candidate) => candidate.activityId === 's-media-photo')
  if (!sheet) throw new Error('Thiếu bảng điểm danh')
  sheet.closedAt = toVnIso(Date.now() - hours * HOUR_MS)
}
const recordOf = (userId: string) => db.attendance.find((record) => record.activityId === 's-media-photo' && record.userId === userId)
const editVy = (fields: { status?: 'EXCUSED' | 'ABSENT' | 'LATE'; reason?: string; version?: number } = {}) =>
  attendanceRepository.mark(PHOTO, 'u-vy', { day: null, status: fields.status ?? 'EXCUSED', reason: fields.reason ?? 'Vy đã báo ốm qua tin nhắn trước buổi.', version: fields.version ?? recordOf('u-vy')?.version ?? 0 })

describe('editing attendance after closing (FR-ATT-08, BR-ATT-04)', () => {
  it('lets the person who closed it edit within the club window, then only the board', async () => {
    signInAs('u-linh')
    closedHoursAgo(47)
    const within = await attendanceRepository.sheet(PHOTO, {})
    expect(within.allowedActions).toEqual(['EDIT'])
    expect(Date.parse(within.editableUntil ?? '')).toBe(Date.parse(within.closedAt ?? '') + 48 * HOUR_MS)
    const edited = await editVy()
    expect(edited.record).toMatchObject({ status: 'EXCUSED', changes: [{ by: { id: 'u-linh' }, from: 'ABSENT', to: 'EXCUSED', reason: 'Vy đã báo ốm qua tin nhắn trước buổi.' }] })

    closedHoursAgo(48)
    expect((await attendanceRepository.sheet(PHOTO, {})).allowedActions).toEqual([])
    expect(await fail(editVy({ status: 'ABSENT' }))).toMatchObject({ status: 403, detail: expect.stringMatching(/^Đã quá hạn sửa \(.+\); chỉ ban chủ nhiệm sửa được/) })
    closedHoursAgo(24 * 7)
    expect(await fail(editVy({ status: 'ABSENT' }))).toMatchObject({ status: 403 })

    signInAs('u-anh')
    expect((await attendanceRepository.sheet(PHOTO, {})).allowedActions).toEqual(['EDIT'])
    const late = await editVy({ status: 'LATE', reason: 'Đối chiếu ảnh chụp: Vy đến lúc 18:40.' })
    expect(late.record?.changes.map((change) => [change.from, change.to])).toEqual([
      ['ABSENT', 'EXCUSED'],
      ['EXCUSED', 'LATE'],
    ])
    signInAs('u-ha')
    expect(await fail(editVy({ status: 'ABSENT' }))).toMatchObject({ status: 403 })
  })

  it('follows the club setting for the window', async () => {
    const guitar = db.clubs.find((club) => club.id === 'c-guitar')
    if (guitar) guitar.attendanceEditHours = 1
    closedHoursAgo(2)
    signInAs('u-linh')
    expect(await fail(editVy())).toMatchObject({ status: 403 })
    if (guitar) guitar.attendanceEditHours = 720
    expect((await editVy()).record?.status).toBe('EXCUSED')
  })

  it('checks the version, then an unchanged status, then the reason', async () => {
    signInAs('u-anh')
    expect(await fail(editVy({ version: 99, reason: '' }))).toMatchObject({ status: 409 })
    expect(await fail(editVy({ status: 'ABSENT', reason: '' }))).toMatchObject({ status: 422, code: 'ATTENDANCE_UNCHANGED' })
    expect(await fail(editVy({ reason: 'ốm' }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
    expect(recordOf('u-vy')?.changes).toEqual([])
  })

  it('records a person who was missed on the day, logs every edit and tells the person', async () => {
    signInAs('u-anh')
    const from = db.auditLogs.length
    const sheetVersion = (await attendanceRepository.sheet(PHOTO, {})).version
    // Nhập lại từ danh sách giấy: người chưa có bản ghi nào.
    const added = await attendanceRepository.mark(PHOTO, 'u-long', { day: null, status: 'PRESENT', reason: 'Nhập lại từ danh sách ký tên giấy.', version: 0 })
    expect(added).toMatchObject({ extra: true, record: { status: 'PRESENT', changes: [{ from: null, to: 'PRESENT' }] } })
    await editVy()
    const logs = db.auditLogs.slice(from)
    expect(logs.map((log) => [log.action, log.objectType, log.before?.status ?? null, log.after?.status, log.reason])).toEqual([
      ['ATTENDANCE_EDIT', 'ATTENDANCE', null, 'PRESENT', 'Nhập lại từ danh sách ký tên giấy.'],
      ['ATTENDANCE_EDIT', 'ATTENDANCE', 'ABSENT', 'EXCUSED', 'Vy đã báo ốm qua tin nhắn trước buổi.'],
    ])
    expect(logs[1]?.objectLabel).toMatch(/^Điểm danh .+: Hoàng Thảo Vy$/)
    expect((await attendanceRepository.sheet(PHOTO, {})).version).toBe(sheetVersion + 2)
    signInAs('u-vy')
    const titles = (await notificationRepository.list({ category: 'SESSION', size: 50 })).content.map((item) => item.title)
    expect(titles.some((title) => title.startsWith('Điểm danh của bạn được sửa:'))).toBe(true)
  })

  it('keeps the QR code closed after closing', async () => {
    signInAs('u-anh')
    expect(await fail(attendanceRepository.code(PHOTO, null))).toMatchObject({ status: 422, code: 'ATTENDANCE_CLOSED' })
  })
})

describe('editing a closed event day (FR-ATT-08, BR-ATT-04)', () => {
  const LIVE = { type: 'EVENT' as const, clubId: 'c-guitar', id: 'e-livestream' }
  const day = () => db.attendanceSheets.find((sheet) => sheet.activityId === 'e-livestream')?.day ?? ''
  const closeHoursAgo = (hours: number) => {
    const sheet = db.attendanceSheets.find((candidate) => candidate.activityId === 'e-livestream')
    if (!sheet) throw new Error('Thiếu bảng điểm danh sự kiện')
    sheet.closedAt = toVnIso(Date.now() - hours * HOUR_MS)
    sheet.closedBy = 'u-kiet'
  }
  const editHa = (reason = 'Hà đến muộn, đối chiếu ảnh chụp.') => {
    const record = db.attendance.find((candidate) => candidate.activityId === 'e-livestream' && candidate.userId === 'u-ha')
    return attendanceRepository.mark(LIVE, 'u-ha', { day: day(), status: 'LATE', reason, version: record?.version ?? 0 })
  }

  it('lets the event lead edit within the window but not a subcommittee member, and only the board afterwards', async () => {
    // Nhân sự tiểu ban: xem và điểm danh được khi đang mở, nhưng không chốt nên không sửa sau khi chốt.
    db.eventStaff.push({ userId: 'u-tram', eventId: 'e-livestream', subcommitteeId: 'sc-live-media', kind: 'MEMBER', joinedAt: toVnIso(Date.now() - 48 * HOUR_MS), leftAt: null })
    closeHoursAgo(1)

    signInAs('u-tram')
    expect((await attendanceRepository.sheet(LIVE, { day: day() })).allowedActions).toEqual([])
    const logsBefore = db.auditLogs.length
    expect(await fail(editHa())).toMatchObject({ status: 403, detail: 'Chỉ người chốt điểm danh và ban chủ nhiệm được sửa điểm danh đã chốt.' })
    expect(db.attendance.find((record) => record.activityId === 'e-livestream' && record.userId === 'u-ha')?.changes).toEqual([])
    expect(db.auditLogs).toHaveLength(logsBefore)

    signInAs('u-kiet')
    expect((await attendanceRepository.sheet(LIVE, { day: day() })).allowedActions).toEqual(['EDIT'])
    expect((await editHa()).record?.status).toBe('LATE')

    closeHoursAgo(49)
    expect((await attendanceRepository.sheet(LIVE, { day: day() })).allowedActions).toEqual([])
    expect(await fail(editHa('Sửa lại lần nữa sau hạn.'))).toMatchObject({ status: 403, detail: expect.stringMatching(/^Đã quá hạn sửa/) })

    signInAs('u-anh')
    expect((await attendanceRepository.sheet(LIVE, { day: day() })).allowedActions).toEqual(['EDIT'])
    const record = db.attendance.find((candidate) => candidate.activityId === 'e-livestream' && candidate.userId === 'u-ha')
    const fixed = await attendanceRepository.mark(LIVE, 'u-ha', { day: day(), status: 'PRESENT', reason: 'Ban chủ nhiệm đối chiếu lại: Hà đến đúng giờ.', version: record?.version ?? 0 })
    expect(fixed.record?.changes.map((change) => change.by.id)).toEqual(['u-kiet', 'u-anh'])
  })
})
