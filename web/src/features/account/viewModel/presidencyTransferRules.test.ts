import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { hasPosition, isBoardMember } from '@/api/mocks/mockPermissions'
import { nowIso, vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { adminRepository } from '../model/adminRepository'
import { presidencyTransferRepository as transfers } from '../model/presidencyTransferRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const REASON = 'Chủ nhiệm không liên lạc được hơn một tháng, đội cần người điều hành.'
const NOTE = 'Đã xác minh với các thành viên.'
const VOLUNTEER = 'c-volunteer'

async function requestAsAnh() {
  signInAs('u-anh')
  return transfers.request(VOLUNTEER, REASON)
}

describe('requesting a forced presidency transfer (FR-ACC-08)', () => {
  it('is refused while the board is active, and offered to active members when it is not', async () => {
    signInAs('u-anh')
    expect(await transfers.overview('c-guitar')).toMatchObject({ boardInactive: false, request: null, allowedActions: [] })
    expect(await fail(transfers.request('c-guitar', REASON))).toMatchObject({ status: 422, code: 'BOARD_ACTIVE' })

    // Chủ nhiệm Đội Tình nguyện (Tâm) đăng nhập lần cuối 45 ngày trước.
    expect(await transfers.overview(VOLUNTEER)).toMatchObject({ boardInactive: true, inactiveDays: 30, allowedActions: ['REQUEST'] })
    expect((await clubRepository.getClub(VOLUNTEER)).allowedActions).toContain('REQUEST_PRESIDENCY_TRANSFER')
    expect((await fail(transfers.request(VOLUNTEER, 'Ngắn quá')))?.fieldErrors.map((error) => error.field)).toEqual(['reason'])

    const created = await transfers.request(VOLUNTEER, REASON)
    expect(created).toMatchObject({ status: 'PENDING', mine: true, reason: REASON, allowedActions: ['CANCEL'] })
    expect(db.transferRequests[0]?.checkAtRequest).toMatchObject({ boardInactive: true })
    expect(await fail(transfers.request(VOLUNTEER, REASON))).toMatchObject({ status: 409, code: 'TRANSFER_REQUEST_EXISTS' })
    expect((await clubRepository.getClub(VOLUNTEER)).allowedActions).not.toContain('REQUEST_PRESIDENCY_TRANSFER')

    // Thành viên khác thấy có yêu cầu nhưng không thấy lý do.
    signInAs('u-hieu')
    expect((await transfers.overview(VOLUNTEER)).request).toMatchObject({ mine: false, reason: null, allowedActions: [] })
  })

  it('refuses probation members and people outside the club', async () => {
    const quan = db.memberships.find((membership) => membership.userId === 'u-quan' && membership.clubId === VOLUNTEER)
    if (quan) quan.status = 'PROBATION'
    signInAs('u-quan')
    expect(await fail(transfers.request(VOLUNTEER, REASON))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    signInAs('u-mai')
    expect(await fail(transfers.request(VOLUNTEER, REASON))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
    expect(db.transferRequests).toEqual([])
  })

  it('lets only the requester cancel a pending request', async () => {
    const created = await requestAsAnh()
    signInAs('u-hieu')
    expect(await fail(transfers.cancel(VOLUNTEER, created.id, created.version))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(transfers.cancel(VOLUNTEER, created.id, created.version + 1))).toMatchObject({ status: 409 })
    expect(await transfers.cancel(VOLUNTEER, created.id, created.version)).toMatchObject({ status: 'CANCELLED', allowedActions: [] })
    expect(await fail(transfers.cancel(VOLUNTEER, created.id, created.version + 1))).toMatchObject({ status: 422, code: 'TRANSFER_NOT_PENDING' })
  })
})

describe('handling the request as admin (FR-ACC-08, R-04, BR-DATA-03)', () => {
  it('keeps admin routes to admin accounts', async () => {
    const created = await requestAsAnh()
    for (const call of [transfers.adminList({ status: 'PENDING' }), transfers.candidates(created.id)]) {
      expect(await fail(call)).toMatchObject({ status: 403, code: 'ADMIN_ONLY' })
    }
  })

  it('lists active members of that club only, and logs each look', async () => {
    const created = await requestAsAnh()
    signInAs('u-admin')
    const pending = await transfers.adminList({ status: 'PENDING' })
    expect(pending.content[0]).toMatchObject({ id: created.id, club: { id: VOLUNTEER }, reason: REASON, checkNow: { boardInactive: true }, allowedActions: ['DECIDE'] })
    expect((await adminRepository.metrics()).pendingTransferRequests).toBe(1)

    const before = db.auditLogs.length
    const candidates = await transfers.candidates(created.id)
    // Tâm đang là Chủ nhiệm nên không có trong danh sách người nhận.
    expect(candidates.map((candidate) => candidate.id).toSorted()).toEqual(['u-anh', 'u-hieu', 'u-quan'])
    expect(Object.keys(candidates[0] ?? {}).toSorted()).toEqual(['departmentName', 'fullName', 'id', 'joinedOn'])
    expect(db.auditLogs).toHaveLength(before + 1)
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'VIEW_TRANSFER_CANDIDATES', clubId: VOLUNTEER, objectId: created.id })
  })

  it('moves only the presidency to the chosen member, tells the whole club and logs before and after', async () => {
    const created = await requestAsAnh()
    signInAs('u-admin')
    expect((await fail(transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-ha', note: NOTE, version: created.version })))?.fieldErrors).toEqual([
      { field: 'newPresidentId', message: 'Chọn một thành viên Chính thức của CLB này.' },
    ])
    expect((await fail(transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-tam', note: NOTE, version: created.version })))?.fieldErrors).toEqual([
      { field: 'newPresidentId', message: 'Người này đang là Chủ nhiệm.' },
    ])
    expect(await fail(transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-anh', note: NOTE, version: created.version + 1 }))).toMatchObject({ status: 409 })

    const approved = await transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-anh', note: NOTE, version: created.version })
    expect(approved).toMatchObject({ status: 'APPROVED', newPresident: { id: 'u-anh' }, handledBy: { id: 'u-admin' }, decisionNote: NOTE, allowedActions: [] })
    expect(hasPosition('u-anh', 'PRESIDENT', VOLUNTEER)).toBe(true)
    expect(isBoardMember('u-tam', VOLUNTEER)).toBe(false)
    const old = db.positions.find((position) => position.userId === 'u-tam' && position.clubId === VOLUNTEER && position.role === 'PRESIDENT')
    expect(old).toMatchObject({ endOn: vnDate(-1), revokeReason: `Quản trị hệ thống chuyển quyền Chủ nhiệm: ${NOTE}` })
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'APPROVE_PRESIDENCY_TRANSFER', before: { presidents: ['u-tam'] }, after: { presidents: ['u-anh'] }, reason: NOTE })

    signInAs('u-hieu')
    const [latest] = (await notificationRepository.list({ category: 'POSITION' })).content
    expect(latest).toMatchObject({ title: 'Nguyễn Minh Anh là Chủ nhiệm mới của Đội Tình nguyện Xanh', target: { type: 'STRUCTURE', clubId: VOLUNTEER } })
    signInAs('u-anh')
    expect((await clubRepository.getClub(VOLUNTEER)).myPositionTitles).toContain('Chủ nhiệm')
  })

  it('ends only the presidency where the board also has a vice president and a treasurer (BR-ORG-02)', async () => {
    // CLB Guitar có đủ Chủ nhiệm (Anh), Phó chủ nhiệm (Huy), Thủ quỹ (Mai); cho cả ba vắng mặt quá 30 ngày.
    for (const userId of ['u-anh', 'u-huy', 'u-mai']) {
      const user = db.users.find((candidate) => candidate.id === userId)
      if (user) user.lastLoginAt = vnDate(-40) + 'T09:00:00+07:00'
    }
    signInAs('u-ha')
    const created = await transfers.request('c-guitar', REASON)
    signInAs('u-admin')
    // Thành viên Thử việc của đúng CLB không nhận được chức.
    expect((await fail(transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-tram', note: NOTE, version: created.version })))?.fieldErrors).toEqual([
      { field: 'newPresidentId', message: 'Chọn một thành viên Chính thức của CLB này.' },
    ])
    await transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-linh', note: NOTE, version: created.version })
    expect(hasPosition('u-linh', 'PRESIDENT', 'c-guitar')).toBe(true)
    expect(hasPosition('u-anh', 'PRESIDENT', 'c-guitar')).toBe(false)
    expect(hasPosition('u-huy', 'VICE_PRESIDENT', 'c-guitar')).toBe(true)
    expect(hasPosition('u-mai', 'TREASURER', 'c-guitar')).toBe(true)
  })

  it('refuses to approve once the board is back, but still lets the admin reject with a note', async () => {
    const created = await requestAsAnh()
    const tam = db.users.find((user) => user.id === 'u-tam')
    if (tam) tam.lastLoginAt = nowIso()
    signInAs('u-admin')
    expect((await transfers.adminList({ status: 'PENDING' })).content[0]?.checkNow).toMatchObject({ boardInactive: false })
    expect(await fail(transfers.decide(created.id, { action: 'APPROVE', newPresidentId: 'u-anh', note: NOTE, version: created.version }))).toMatchObject({
      status: 422,
      code: 'BOARD_ACTIVE',
    })
    expect((await fail(transfers.decide(created.id, { action: 'REJECT', note: '', version: created.version })))?.fieldErrors.map((error) => error.field)).toEqual(['note'])
    const rejected = await transfers.decide(created.id, { action: 'REJECT', note: 'Chủ nhiệm đã liên lạc lại.', version: created.version })
    expect(rejected.status).toBe('REJECTED')
    expect(hasPosition('u-tam', 'PRESIDENT', VOLUNTEER)).toBe(true)
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'REJECT_PRESIDENCY_TRANSFER', objectId: created.id, reason: 'Chủ nhiệm đã liên lạc lại.' })
    expect(await fail(transfers.candidates(created.id))).toMatchObject({ status: 422, code: 'TRANSFER_NOT_PENDING' })
    expect((await transfers.adminList({ status: 'HANDLED' })).content.map((request) => request.id)).toEqual([created.id])

    signInAs('u-anh')
    expect((await transfers.overview(VOLUNTEER)).request).toMatchObject({ status: 'REJECTED', mine: true, decisionNote: 'Chủ nhiệm đã liên lạc lại.' })
    const [latest] = (await notificationRepository.list({ category: 'POSITION' })).content
    expect(latest).toMatchObject({ title: 'Yêu cầu chuyển quyền Chủ nhiệm bị từ chối' })
  })
})
