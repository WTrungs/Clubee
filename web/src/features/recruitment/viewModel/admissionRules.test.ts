import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db, type DbApplication } from '@/api/mocks/db'
import { expireAdmissions } from '@/api/mocks/mockRecruitmentResults'
import { nowIso, vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const application = (id: string) => db.applications.find((candidate) => candidate.id === id) as DbApplication
const recruitment = () => db.recruitments.find((candidate) => candidate.id === 'rec-guitar-k1')
const passAll = (id: string, score: number) => {
  application(id).roundResults = ['rr-k1-screen', 'rr-k1-interview'].map((roundId) => ({ roundId, result: 'PASS' as const, score, note: '', by: 'u-anh', at: nowIso() }))
}

/** Mỗi ban 1 chỉ tiêu: u-tu trúng Chuyên môn, u-tam dự bị Chuyên môn #1, u-dat trúng Hậu cần. */
async function finalized() {
  Object.assign(recruitment() ?? {}, {
    closesAt: vnDayAt(-1, 22),
    quotas: [
      { departmentId: 'd-media', quota: 1 },
      { departmentId: 'd-music', quota: 1 },
      { departmentId: 'd-logistics', quota: 1 },
    ],
  })
  db.applications.push({ ...application('ap-dat'), id: 'ap-tam', userId: 'u-tam', choices: ['d-music'], studentId: '22520002', submittedAt: vnDayAt(-1, 9), version: 1 })
  passAll('ap-tu', 90)
  passAll('ap-tam', 80)
  passAll('ap-dat', 70)
  signInAs('u-anh')
  const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
  const decisions = proposal.rows.map((row) => ({ applicationId: row.application.id, decision: row.decision, departmentId: row.departmentId, reserveOrder: row.reserveOrder }))
  return recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions, responseDays: 7, version: proposal.version })
}
const mine = async (userId: string) => {
  signInAs(userId)
  const [found] = await recruitmentRepository.myApplications()
  if (!found) throw new Error(`Thiếu đơn của ${userId}`)
  return found
}

describe('accepting or declining an admission (FR-REC-08, ST-APP)', () => {
  it('creates a probation membership in the admitted department with the student id and history', async () => {
    await finalized()
    const tu = await mine('u-tu')
    expect(tu).toMatchObject({ status: 'ADMITTED', allowedActions: ['RESPOND'] })
    const accepted = await recruitmentRepository.respond(tu.id, { decision: 'ACCEPT', version: tu.version })
    expect(accepted).toMatchObject({ status: 'ACCEPTED', allowedActions: [] })
    const membership = db.memberships.find((candidate) => candidate.userId === 'u-tu' && candidate.clubId === 'c-guitar')
    expect(membership).toMatchObject({ status: 'PROBATION', departmentId: 'd-music', studentId: '22520001', history: [expect.objectContaining({ fromStatus: null, toStatus: 'PROBATION' })] })
    expect(db.auditLogs.some((log) => log.action === 'CHANGE_MEMBER_STATUS' && log.objectId === membership?.id)).toBe(true)
    signInAs('u-anh')
    expect((await notificationRepository.list({ category: 'RECRUITMENT' })).content[0]?.title).toBe('Châu Minh Tú đã nhận kết quả Tuyển thành viên học kỳ 1 năm học 2026–2027')
  })

  it('approves a pending join request instead of creating a second membership, and becomes official when the club skips probation', async () => {
    await finalized()
    const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
    if (club) club.probationStep = false
    db.memberships.push({ ...db.memberships.find((candidate) => candidate.userId === 'u-quan' && candidate.clubId === 'c-guitar')!, id: 'm-tu-pending', userId: 'u-tu', history: [], version: 1 })
    const tu = await mine('u-tu')
    await recruitmentRepository.respond(tu.id, { decision: 'ACCEPT', version: tu.version })
    const memberships = db.memberships.filter((candidate) => candidate.userId === 'u-tu' && candidate.clubId === 'c-guitar')
    expect(memberships.map((candidate) => [candidate.id, candidate.status, candidate.departmentId])).toEqual([['m-tu-pending', 'ACTIVE', 'd-music']])
  })

  it('refuses outside the admitted state, after the deadline, for current members and closed departments', async () => {
    await finalized()
    const tam = await mine('u-tam')
    expect(tam.allowedActions).toEqual([])
    expect(await fail(recruitmentRepository.respond(tam.id, { decision: 'ACCEPT', version: tam.version }))).toMatchObject({ status: 422, code: 'APPLICATION_NOT_ADMITTED' })
    expect(await fail(recruitmentRepository.respond('ap-tu', { decision: 'ACCEPT', version: 1 }))).toMatchObject({ status: 404 })

    const tu = await mine('u-tu')
    expect(await fail(recruitmentRepository.respond(tu.id, { decision: 'ACCEPT', version: tu.version + 1 }))).toMatchObject({ status: 409 })
    const media = db.departments.find((candidate) => candidate.id === 'd-music')
    if (media) media.status = 'CLOSED'
    expect(await fail(recruitmentRepository.respond(tu.id, { decision: 'ACCEPT', version: tu.version }))).toMatchObject({ code: 'DEPARTMENT_CLOSED' })
    // Từ chối vẫn được dù ban đã đóng.
    const dat = await mine('u-dat')
    db.memberships.push({ ...db.memberships.find((candidate) => candidate.userId === 'u-ha' && candidate.clubId === 'c-guitar')!, id: 'm-dat-again', userId: 'u-dat' })
    expect(await fail(recruitmentRepository.respond(dat.id, { decision: 'ACCEPT', version: dat.version }))).toMatchObject({ code: 'ALREADY_MEMBER' })
    // Quá hạn thì việc theo giờ chạy trước mỗi request nên đơn đã thành Từ chối nhận.
    const outcome = application('ap-dat').outcome
    if (outcome) outcome.respondBy = vnDayAt(-1, 8)
    const expired = await mine('u-dat')
    expect(expired).toMatchObject({ status: 'DECLINED', allowedActions: [] })
    expect(await fail(recruitmentRepository.respond(expired.id, { decision: 'ACCEPT', version: expired.version }))).toMatchObject({ code: 'APPLICATION_NOT_ADMITTED' })
  })

  it('turns an expired admission into a decline and tells the applicant and the board', async () => {
    await finalized()
    const outcome = application('ap-dat').outcome
    if (outcome) outcome.respondBy = vnDayAt(-1, 8)
    expireAdmissions()
    expireAdmissions()
    expect(application('ap-dat').status).toBe('DECLINED')
    signInAs('u-dat')
    expect((await notificationRepository.list({ category: 'RECRUITMENT' })).content.filter((notification) => notification.title.startsWith('Đã quá hạn nhận kết quả'))).toHaveLength(1)
    signInAs('u-huy')
    expect((await notificationRepository.list({ category: 'RECRUITMENT' })).content[0]?.title).toBe('Hồ Tấn Đạt quá hạn nhận kết quả Tuyển thành viên học kỳ 1 năm học 2026–2027')
  })
})

describe('calling reserves and closing the recruitment (FR-REC-08)', () => {
  it('calls the next reserve into a freed seat, in order, and closes once nobody is waiting', async () => {
    const saved = await finalized()
    expect(saved.departmentResults.find((result) => result.departmentId === 'd-music')).toMatchObject({ quota: 1, pending: 1, reserves: 1, freeSlots: 0 })
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-music', saved.version))).toMatchObject({ status: 422, code: 'NO_FREE_SLOT' })
    expect(await fail(recruitmentRepository.close('c-guitar', 'rec-guitar-k1', saved.version))).toMatchObject({ status: 422, code: 'RESPONSES_PENDING' })

    const tu = await mine('u-tu')
    await recruitmentRepository.respond(tu.id, { decision: 'DECLINE', version: tu.version })
    signInAs('u-anh')
    const afterDecline = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(afterDecline.departmentResults.find((result) => result.departmentId === 'd-music')).toMatchObject({ declined: 1, freeSlots: 1, reserves: 1 })
    const called = await recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-music', afterDecline.version)
    expect(application('ap-tam')).toMatchObject({ status: 'ADMITTED', outcome: { departmentId: 'd-music', reserveOrder: null } })
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-logistics', called.version))).toMatchObject({ code: 'NO_FREE_SLOT' })
    signInAs('u-tam')
    expect((await recruitmentRepository.myApplications())[0]).toMatchObject({ status: 'ADMITTED', allowedActions: ['RESPOND'] })

    const tam = await mine('u-tam')
    await recruitmentRepository.respond(tam.id, { decision: 'ACCEPT', version: tam.version })
    const dat = await mine('u-dat')
    await recruitmentRepository.respond(dat.id, { decision: 'ACCEPT', version: dat.version })
    signInAs('u-anh')
    const ready = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-media', ready.version))).toMatchObject({ code: 'NO_RESERVE' })
    const closed = await recruitmentRepository.close('c-guitar', 'rec-guitar-k1', ready.version)
    expect(closed).toMatchObject({ status: 'CLOSED', allowedActions: ['VIEW_APPLICATIONS'] })
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-music', closed.version))).toMatchObject({ code: 'RECRUITMENT_NOT_FINALIZED' })
  })

  it('reports no reserve left and keeps it to the board', async () => {
    await finalized()
    const dat = await mine('u-dat')
    await recruitmentRepository.respond(dat.id, { decision: 'DECLINE', version: dat.version })
    signInAs('u-anh')
    const fresh = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-logistics', fresh.version))).toMatchObject({ code: 'NO_RESERVE' })
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-design', fresh.version))).toMatchObject({ status: 400 })
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-music', fresh.version + 1))).toMatchObject({ status: 409 })
    signInAs('u-linh')
    expect(await fail(recruitmentRepository.callReserve('c-guitar', 'rec-guitar-k1', 'd-music', fresh.version))).toMatchObject({ status: 403 })
    expect((await recruitmentRepository.get('c-guitar', 'rec-guitar-k1').catch(() => null))?.departmentResults ?? []).toEqual([])
  })
})
