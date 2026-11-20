import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { generalFundId } from '@/api/mocks/seed/financeSeed'
import { attendanceRepository } from '@/features/attendance/model/attendanceRepository'
import type { AttendanceActivityRef } from '@/features/attendance/model/attendanceTypes'
import { financeRepository } from '@/features/finance/model/financeRepository'
import type { CreateTransactionRequest } from '@/features/finance/model/financeTypes'
import { memberRepository } from '@/features/member/model/memberRepository'
import { signInAs } from '@/testUtils'
import { clubRepository } from '../model/clubRepository'
import type { UpdateClubSettingsRequest } from '../model/clubTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const guitar = () => {
  const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
  if (!club) throw new Error('Thiếu c-guitar')
  return club
}

/** Tham số như đang lưu, ghi đè những ô cần đổi. */
function request(changes: Partial<UpdateClubSettingsRequest> = {}): UpdateClubSettingsRequest {
  const club = guitar()
  return {
    probationStep: club.probationStep,
    inviteLinkDays: club.inviteLinkDays,
    registrationCancelHours: club.registrationCancelHours,
    rescheduleConfirmHours: club.rescheduleConfirmHours,
    attendanceLeadMinutes: club.attendanceLeadMinutes,
    attendanceQrRotateSeconds: club.attendanceQrRotateSeconds,
    taskReminderDays: club.taskReminderDays,
    expenseReceiptThreshold: club.expenseReceiptThreshold,
    advanceSettleDays: club.advanceSettleDays,
    semester1Start: club.semester1Start,
    semester2Start: club.semester2Start,
    summerStart: club.summerStart,
    version: club.settingsVersion,
    ...changes,
  }
}

const expense = (fields: Partial<CreateTransactionRequest> = {}): CreateTransactionRequest => ({
  fundId: generalFundId('c-guitar'),
  type: 'EXPENSE',
  amount: 150_000,
  category: 'PRINTING',
  description: 'In tờ rơi giới thiệu CLB',
  attachmentIds: [],
  ...fields,
})

describe('club settings (FR-CLB-03)', () => {
  it('lets the board read and save the settings, with who saved them', async () => {
    signInAs('u-anh')
    const before = await clubRepository.settings('c-guitar')
    expect(before).toEqual({
      probationStep: true,
      inviteLinkDays: 7,
      registrationCancelHours: 24,
      rescheduleConfirmHours: 48,
      attendanceLeadMinutes: 15,
      attendanceQrRotateSeconds: 30,
      taskReminderDays: 1,
      expenseReceiptThreshold: 200_000,
      advanceSettleDays: 14,
      semester1Start: '09-01',
      semester2Start: '02-01',
      summerStart: null,
      updatedAt: null,
      updatedBy: null,
      version: 1,
    })
    const saved = await clubRepository.updateSettings('c-guitar', request({ inviteLinkDays: 14, expenseReceiptThreshold: 500_000 }))
    expect(saved).toMatchObject({ inviteLinkDays: 14, expenseReceiptThreshold: 500_000, updatedBy: { id: 'u-anh' }, version: 2 })
    expect(saved.updatedAt).not.toBeNull()

    // Không đổi gì thì không tăng version, để người khác đang sửa không bị 409 oan.
    expect((await clubRepository.updateSettings('c-guitar', request())).version).toBe(2)

    // Sửa tham số có version riêng nên không chặn người đang sửa hồ sơ CLB.
    expect((await clubRepository.getClub('c-guitar')).version).toBe(1)
  })

  it('refuses members outside the board, and people outside the club', async () => {
    signInAs('u-ha')
    expect(await fail(clubRepository.settings('c-guitar'))).toMatchObject({ status: 403, code: 'FORBIDDEN', detail: expect.stringContaining('tham số CLB') })
    expect(await fail(clubRepository.updateSettings('c-guitar', request({ inviteLinkDays: 3 })))).toMatchObject({
      status: 403,
      detail: 'Chỉ ban chủ nhiệm được sửa tham số CLB.',
    })
    expect(guitar()).toMatchObject({ inviteLinkDays: 7, settingsVersion: 1 })

    signInAs('u-tu')
    expect(await fail(clubRepository.settings('c-guitar'))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })

  it('rejects a stale version before checking values (NFR-REL-03)', async () => {
    signInAs('u-anh')
    await clubRepository.updateSettings('c-guitar', request({ attendanceLeadMinutes: 20 }))
    const stale = await fail(clubRepository.updateSettings('c-guitar', request({ inviteLinkDays: 99, version: 1 })))
    expect(stale).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(guitar()).toMatchObject({ attendanceLeadMinutes: 20, inviteLinkDays: 7, settingsVersion: 2 })
  })

  it('reports each out-of-range field and saves nothing', async () => {
    signInAs('u-anh')
    const error = await fail(
      clubRepository.updateSettings(
        'c-guitar',
        request({ inviteLinkDays: 0, attendanceLeadMinutes: 121, attendanceQrRotateSeconds: 9, expenseReceiptThreshold: 1.5 }),
      ),
    )
    expect(error?.status).toBe(400)
    expect(error?.fieldErrors).toEqual([
      { field: 'inviteLinkDays', message: 'Hạn liên kết mời từ 1 đến 30 ngày.' },
      { field: 'attendanceLeadMinutes', message: 'Mở điểm danh trước giờ từ 0 đến 120 phút.' },
      { field: 'attendanceQrRotateSeconds', message: 'Chu kỳ đổi mã từ 10 đến 300 giây.' },
      { field: 'expenseReceiptThreshold', message: 'Ngưỡng chứng từ từ 0 đ đến 100.000.000 đ.' },
    ])
    const tooBig = await fail(clubRepository.updateSettings('c-guitar', request({ expenseReceiptThreshold: 100_000_001, probationStep: 'yes' as unknown as boolean })))
    expect(tooBig?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['probationStep', 'expenseReceiptThreshold'])
    // Hai đầu khoảng đều hợp lệ.
    const edges = await clubRepository.updateSettings('c-guitar', request({ inviteLinkDays: 30, attendanceLeadMinutes: 0, attendanceQrRotateSeconds: 300, expenseReceiptThreshold: 0 }))
    expect(edges).toMatchObject({ inviteLinkDays: 30, attendanceLeadMinutes: 0, attendanceQrRotateSeconds: 300, expenseReceiptThreshold: 0 })
  })

  it('checks the event, task and advance settings at both ends of their ranges', async () => {
    signInAs('u-anh')
    const outside = await fail(clubRepository.updateSettings('c-guitar', request({ registrationCancelHours: 169, rescheduleConfirmHours: 0, taskReminderDays: 15, advanceSettleDays: 0 })))
    expect(outside?.fieldErrors).toEqual([
      { field: 'registrationCancelHours', message: 'Hạn hủy đăng ký từ 0 đến 168 giờ trước giờ bắt đầu.' },
      { field: 'rescheduleConfirmHours', message: 'Hạn xác nhận lại từ 1 đến 168 giờ.' },
      { field: 'taskReminderDays', message: 'Nhắc hạn công việc từ 0 đến 14 ngày trước hạn.' },
      { field: 'advanceSettleDays', message: 'Hạn quyết toán tạm ứng từ 1 đến 90 ngày.' },
    ])
    expect(guitar().settingsVersion).toBe(1)
    const low = await clubRepository.updateSettings('c-guitar', request({ registrationCancelHours: 0, rescheduleConfirmHours: 1, taskReminderDays: 0, advanceSettleDays: 1 }))
    expect(low).toMatchObject({ registrationCancelHours: 0, rescheduleConfirmHours: 1, taskReminderDays: 0, advanceSettleDays: 1, version: 2 })
    const high = await clubRepository.updateSettings('c-guitar', request({ registrationCancelHours: 168, rescheduleConfirmHours: 168, taskReminderDays: 14, advanceSettleDays: 90 }))
    expect(high).toMatchObject({ registrationCancelHours: 168, rescheduleConfirmHours: 168, taskReminderDays: 14, advanceSettleDays: 90, version: 3 })
  })

  it('accepts semester marks only as real, distinct dates in year order (FR-FIN-12)', async () => {
    signInAs('u-anh')
    const fields = async (changes: Partial<UpdateClubSettingsRequest>) => (await fail(clubRepository.updateSettings('c-guitar', request(changes))))?.fieldErrors ?? []
    expect(await fields({ semester1Start: '02-29', semester2Start: '13-01', summerStart: '9-1' })).toEqual([
      { field: 'semester1Start', message: 'Nhập ngày có thật dạng ngày/tháng, ví dụ 01/09.' },
      { field: 'semester2Start', message: 'Nhập ngày có thật dạng ngày/tháng, ví dụ 01/09.' },
      { field: 'summerStart', message: 'Nhập ngày có thật dạng ngày/tháng, ví dụ 01/09.' },
    ])
    expect(await fields({ semester2Start: '09-01' })).toEqual([{ field: 'semester2Start', message: 'Các mốc học kỳ phải khác nhau.' }])
    // Hè nằm giữa HK1 (01/09) và HK2 (01/02) theo vòng năm là sai thứ tự.
    expect(await fields({ summerStart: '12-01' })).toEqual([{ field: 'summerStart', message: 'Kỳ hè phải bắt đầu sau học kỳ 2 và trước học kỳ 1 năm sau.' }])
    expect(await fields({ summerStart: undefined })).toEqual([{ field: 'summerStart', message: 'Nhập ngày có thật dạng ngày/tháng, ví dụ 01/09.' }])
    expect(guitar().settingsVersion).toBe(1)

    const saved = await clubRepository.updateSettings('c-guitar', request({ semester1Start: '08-15', semester2Start: '01-10', summerStart: '06-20' }))
    expect(saved).toMatchObject({ semester1Start: '08-15', semester2Start: '01-10', summerStart: '06-20', version: 2 })
    expect((await clubRepository.updateSettings('c-guitar', request({ summerStart: null }))).summerStart).toBeNull()
  })
})

describe('new settings do not apply backwards (FR-CLB-03)', () => {
  it('checks a new threshold on new proposals and on approving pending ones, never on approved or posted expenses', async () => {
    signInAs('u-linh')
    const pending = await financeRepository.create('c-guitar', expense())
    signInAs('u-anh')
    await clubRepository.updateSettings('c-guitar', request({ expenseReceiptThreshold: 100_000 }))
    expect((await financeRepository.fund('c-guitar', generalFundId('c-guitar'))).receiptThreshold).toBe(100_000)

    signInAs('u-linh')
    const fresh = await fail(financeRepository.create('c-guitar', expense()))
    expect(fresh?.fieldErrors).toEqual([{ field: 'attachmentIds', message: 'Khoản chi trên 100.000 đ phải có chứng từ.' }])

    signInAs('u-huy')
    const approve = await fail(financeRepository.transition('c-guitar', pending.id, { action: 'APPROVE', version: pending.version }))
    expect(approve).toMatchObject({ status: 422, code: 'RECEIPT_REQUIRED' })

    // Khoản Đã duyệt từ trước, không chứng từ, vẫn ghi sổ được.
    signInAs('u-mai')
    const capo = await financeRepository.transaction('c-guitar', 'tx-capo')
    expect(capo).toMatchObject({ status: 'APPROVED', attachments: [] })
    expect(capo.amount).toBeGreaterThan(100_000)
    expect((await financeRepository.transition('c-guitar', capo.id, { action: 'POST', version: capo.version })).status).toBe('POSTED')
  })

  it('keeps people already on probation when the probation step is turned off', async () => {
    signInAs('u-anh')
    await clubRepository.updateSettings('c-guitar', request({ probationStep: false }))
    const tram = db.memberships.find((membership) => membership.clubId === 'c-guitar' && membership.userId === 'u-tram')
    expect(tram?.status).toBe('PROBATION')
    expect((await memberRepository.get('c-guitar', tram?.id ?? '')).allowedActions).toContain('CONFIRM')

    const requests = await memberRepository.joinRequests('c-guitar', {})
    const phuong = requests.content.find((joinRequest) => joinRequest.applicant.id === 'u-phuong')
    expect(phuong?.allowedActions).toEqual(['APPROVE_ACTIVE', 'REJECT'])
  })

  it('moves the opening time of open sessions but leaves closed attendance as it was', async () => {
    const photo: AttendanceActivityRef = { type: 'SESSION', clubId: 'c-guitar', id: 's-media-photo' }
    const plan: AttendanceActivityRef = { type: 'SESSION', clubId: 'c-guitar', id: 's-media-plan' }
    signInAs('u-linh')
    const closedBefore = await attendanceRepository.sheet(photo, {})
    signInAs('u-anh')
    await clubRepository.updateSettings('c-guitar', request({ attendanceLeadMinutes: 120 }))

    signInAs('u-linh')
    const closedAfter = await attendanceRepository.sheet(photo, {})
    expect(closedAfter).toMatchObject({ closedAt: closedBefore.closedAt, counts: closedBefore.counts, allowedActions: [], version: closedBefore.version })
    const planSheet = await attendanceRepository.sheet(plan, {})
    const startAt = db.sessions.find((session) => session.id === 's-media-plan')?.startAt ?? ''
    expect(Date.parse(planSheet.opensAt)).toBe(Date.parse(startAt) - 120 * 60 * 1000)
  })
})
