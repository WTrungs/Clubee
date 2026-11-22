import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db, type DbApplication } from '@/api/mocks/db'
import { nowIso, vnDayAt } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { FinalizeRequest, ResultProposal } from '../model/recruitmentTypes'
import { draftProblems, groupByDepartment } from './useResultsViewModel'
import { quotaUsage } from './recruitmentDisplay'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const seeded = () => {
  const found = db.recruitments.find((recruitment) => recruitment.id === 'rec-guitar-k1')
  if (!found) throw new Error('Thiếu đợt tuyển seed')
  return found
}
const application = (id: string) => db.applications.find((candidate) => candidate.id === id) as DbApplication
const scores = (id: string, screen: number | 'FAIL', interview?: number) => {
  const target = application(id)
  target.roundResults = [
    { roundId: 'rr-k1-screen', result: screen === 'FAIL' ? 'FAIL' : 'PASS', score: screen === 'FAIL' ? null : screen, note: screen === 'FAIL' ? 'Chưa phù hợp.' : '', by: 'u-anh', at: nowIso() },
    ...(interview === undefined ? [] : [{ roundId: 'rr-k1-interview', result: 'PASS' as const, score: interview, note: '', by: 'u-anh', at: nowIso() }]),
  ]
  target.status = screen === 'FAIL' ? 'ELIMINATED' : 'SUBMITTED'
}
const extra = (id: string, userId: string, choices: string[], daysAgo: number) =>
  db.applications.push({ ...application('ap-dat'), id, userId, choices, submittedAt: vnDayAt(-daysAgo, 9), roundResults: [], status: 'SUBMITTED', version: 1 })

/** Mỗi ban 1 chỉ tiêu; đợt đã đóng nhận đơn; năm đơn qua hết các vòng và một đơn bị loại. */
function scenario() {
  Object.assign(seeded(), {
    closesAt: vnDayAt(-1, 22),
    quotas: [
      { departmentId: 'd-media', quota: 1 },
      { departmentId: 'd-music', quota: 1 },
      { departmentId: 'd-logistics', quota: 1 },
    ],
  })
  extra('ap-tam', 'u-tam', ['d-music'], 1)
  extra('ap-lan', 'u-lan', ['d-media', 'd-music'], 1)
  extra('ap-khanh', 'u-khanh', ['d-music', 'd-logistics'], 1)
  extra('ap-yen', 'u-yen', ['d-media'], 1)
  scores('ap-tu', 82, 88)
  scores('ap-tam', 90, 80)
  scores('ap-dat', 70, 80)
  scores('ap-lan', 60, 60)
  scores('ap-khanh', 50, 50)
  scores('ap-yen', 'FAIL')
}
const decisionsOf = (proposal: ResultProposal): FinalizeRequest['decisions'] =>
  proposal.rows.map((row) => ({ applicationId: row.application.id, decision: row.decision, departmentId: row.departmentId, reserveOrder: row.reserveOrder }))

describe('proposing results (FR-REC-07, decision 20/11)', () => {
  it('ranks by total score, breaks ties by submission time and fills choices in order within quotas', async () => {
    scenario()
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    expect(proposal.blockers).toEqual([])
    expect(proposal.rows.map((row) => [row.application.id, row.rank, row.decision, row.departmentId, row.reserveOrder])).toEqual([
      // u-tu và u-tam cùng 170 điểm, u-tu nộp trước.
      ['ap-tu', 1, 'ADMITTED', 'd-music', null],
      ['ap-tam', 2, 'RESERVE', 'd-music', 1],
      ['ap-dat', 3, 'ADMITTED', 'd-logistics', null],
      ['ap-lan', 4, 'ADMITTED', 'd-media', null],
      // Hết chỉ tiêu mọi nguyện vọng và danh sách dự bị ban nhạc đã đủ.
      ['ap-khanh', 5, 'NOT_ADMITTED', null, null],
      ['ap-yen', null, 'NOT_ADMITTED', null, null],
    ])
  })

  it('lists the applications still pending a round as blockers', async () => {
    scenario()
    application('ap-dat').roundResults = application('ap-dat').roundResults.slice(0, 1)
    signInAs('u-anh')
    expect((await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')).blockers).toEqual(['Còn 1 đơn chưa xét xong các vòng.'])
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    expect(await fail(recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: decisionsOf(proposal), responseDays: 7, version: proposal.version }))).toMatchObject({
      status: 422,
      code: 'ROUNDS_INCOMPLETE',
    })
  })
})

describe('finalizing results (FR-REC-07)', () => {
  it('records each outcome with a response deadline and notifies applicants and the board', async () => {
    scenario()
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    const saved = await recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: decisionsOf(proposal), responseDays: 5, version: proposal.version })
    expect(saved).toMatchObject({ status: 'RESULTS', responseDays: 5, allowedActions: ['VIEW_APPLICATIONS'] })
    expect(application('ap-tu')).toMatchObject({ status: 'ADMITTED', outcome: { departmentId: 'd-music', reserveOrder: null } })
    expect(Date.parse(application('ap-tu').outcome?.respondBy ?? '') - Date.now()).toBeGreaterThan(4.9 * 86_400_000)
    expect(application('ap-tam')).toMatchObject({ status: 'RESERVE', outcome: { departmentId: 'd-music', reserveOrder: 1, respondBy: null } })
    expect(application('ap-yen')).toMatchObject({ status: 'NOT_ADMITTED', outcome: { departmentId: null } })

    const bodyOf = async (userId: string) => {
      signInAs(userId)
      const [latest] = (await notificationRepository.list({ category: 'RECRUITMENT' })).content
      return latest ? { ...latest, body: (await notificationRepository.get(latest.id)).body } : undefined
    }
    const tu = await bodyOf('u-tu')
    expect(tu).toMatchObject({ title: 'Tuyển thành viên học kỳ 1 năm học 2026–2027: Trúng tuyển', target: { type: 'APPLICATION', id: 'rec-guitar-k1' } })
    expect(tu?.body).toMatch(/^Bạn trúng tuyển vào ban Chuyên môn\. Nhận kết quả trước \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\.$/)
    expect((await bodyOf('u-tam'))?.body).toBe('Bạn ở danh sách dự bị của ban Chuyên môn, thứ tự 1. CLB sẽ báo nếu có chỗ.')
    expect((await bodyOf('u-yen'))?.body).toBe('Cảm ơn bạn đã ứng tuyển. Lần này bạn chưa trúng tuyển.')
    signInAs('u-tu')
    const mine = (await recruitmentRepository.myApplications())[0]
    expect(mine?.outcome).toMatchObject({ departmentName: 'Chuyên môn' })
    signInAs('u-huy')
    expect((await notificationRepository.list({ category: 'RECRUITMENT' })).content[0]).toMatchObject({ target: { type: 'RECRUITMENT', clubId: 'c-guitar' } })

    signInAs('u-anh')
    expect(await fail(recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: decisionsOf(proposal), responseDays: 5, version: saved.version }))).toMatchObject({
      code: 'RECRUITMENT_FINALIZED',
    })
    expect(await fail(recruitmentRepository.reviewRound('c-guitar', 'rec-guitar-k1', 'ap-khanh', 'rr-k1-screen', { result: 'PASS', score: 90, note: '', version: application('ap-khanh').version }))).toMatchObject({
      code: 'RECRUITMENT_FINALIZED',
    })
  })

  it('refuses before closing, over quota and with bad rows, in that order', async () => {
    scenario()
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    const decisions = decisionsOf(proposal)
    const send = (rows: FinalizeRequest['decisions'], responseDays = 7, version = proposal.version) => recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: rows, responseDays, version })

    signInAs('u-linh')
    expect(await fail(send(decisions))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(send(decisions, 7, 99))).toMatchObject({ status: 409 })
    const overQuota = decisions.map((row) => (row.applicationId === 'ap-tam' ? { ...row, decision: 'ADMITTED' as const, reserveOrder: null } : row))
    expect(await fail(send(overQuota))).toMatchObject({ status: 422, code: 'QUOTA_EXCEEDED' })
    const wrongDepartment = decisions.map((row) => (row.applicationId === 'ap-lan' ? { ...row, departmentId: 'd-logistics' } : row))
    expect(fields(await fail(send(wrongDepartment, 0)))).toEqual(['decisions[3].departmentId', 'responseDays'])
    const eliminatedAdmitted = decisions.map((row) => (row.applicationId === 'ap-yen' ? { ...row, decision: 'RESERVE' as const, departmentId: 'd-media', reserveOrder: 1 } : row))
    expect(fields(await fail(send(eliminatedAdmitted)))).toEqual(['decisions[5].decision'])
    expect(fields(await fail(send(decisions.slice(1))))).toEqual(['decisions'])

    seeded().closesAt = vnDayAt(2, 22)
    expect(await fail(send(decisions))).toMatchObject({ status: 422, code: 'RECRUITMENT_STILL_OPEN' })
  })
})

describe('results after finalizing (FR-REC-07)', () => {
  it('pages every outcome group, beyond the first 50 applications', async () => {
    scenario()
    for (let index = 0; index < 55; index += 1) {
      extra(`ap-many-${index}`, 'u-lan', ['d-media'], 2)
      scores(`ap-many-${index}`, 'FAIL')
    }
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    await recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: decisionsOf(proposal), responseDays: 7, version: proposal.version })
    const first = await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { outcome: 'NOT_ADMITTED' })
    expect(first).toMatchObject({ totalElements: 57, totalPages: 2 })
    expect((await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { outcome: 'NOT_ADMITTED', page: 1 })).content).toHaveLength(7)
    expect((await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { outcome: 'ADMITTED' })).content.map((row) => row.outcome?.departmentName)).toEqual(['Chuyên môn', 'Hậu cần', 'Truyền thông'])
    expect((await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { outcome: 'RESERVE' })).content.map((row) => row.id)).toEqual(['ap-tam'])
  })

  it('can finalize a recruitment whose applications were all withdrawn', async () => {
    Object.assign(seeded(), { closesAt: vnDayAt(-1, 22) })
    for (const candidate of db.applications) candidate.status = 'WITHDRAWN'
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    expect(proposal.rows).toEqual([])
    await expect(recruitmentRepository.finalize('c-guitar', 'rec-guitar-k1', { decisions: [], responseDays: 7, version: proposal.version })).resolves.toMatchObject({ status: 'RESULTS' })
  })
})

describe('result draft helpers (FR-REC-07)', () => {
  it('counts admitted per department and checks reserve orders and days', () => {
    const usage = quotaUsage(
      [{ departmentId: 'd-music', departmentName: 'Chuyên môn', quota: 1 }],
      [
        { decision: 'ADMITTED', departmentId: 'd-music' },
        { decision: 'ADMITTED', departmentId: 'd-music' },
        { decision: 'RESERVE', departmentId: 'd-music' },
      ],
    )
    expect(usage).toEqual([{ departmentId: 'd-music', departmentName: 'Chuyên môn', quota: 1, admitted: 2, over: true }])
    expect(draftProblems([{ applicationId: 'a', decision: 'RESERVE', departmentId: 'd-music', reserveOrder: '1' }, { applicationId: 'b', decision: 'RESERVE', departmentId: 'd-music', reserveOrder: '1' }], '7')).toEqual([
      'Thứ tự dự bị bị trùng trong một ban.',
    ])
    expect(draftProblems([{ applicationId: 'a', decision: 'RESERVE', departmentId: 'd-music', reserveOrder: '0' }], '31')).toEqual(['Thứ tự dự bị là số nguyên từ 1.', 'Số ngày nhận kết quả từ 1 đến 30.'])
  })

  it('groups the proposal by department, admitted then reserves, and moves a row when its department changes', async () => {
    scenario()
    signInAs('u-anh')
    const proposal = await recruitmentRepository.proposal('c-guitar', 'rec-guitar-k1')
    const drafts = proposal.rows.map((row) => ({ applicationId: row.application.id, decision: row.decision, departmentId: row.departmentId, reserveOrder: row.reserveOrder ? String(row.reserveOrder) : '' }))
    const sections = groupByDepartment(proposal.rows, drafts, proposal.quotas)
    expect(sections.map((section) => [section.title, section.rows.map((row) => row.application.id)])).toEqual([
      ['Ban Truyền thông', ['ap-lan']],
      ['Ban Chuyên môn', ['ap-tu', 'ap-tam']],
      ['Ban Hậu cần', ['ap-dat']],
      ['Trượt', ['ap-khanh', 'ap-yen']],
    ])
    const moved = drafts.map((draft) => (draft.applicationId === 'ap-dat' ? { ...draft, departmentId: 'd-music' } : draft))
    expect(groupByDepartment(proposal.rows, moved, proposal.quotas)[1]?.rows.map((row) => row.application.id)).toEqual(['ap-tu', 'ap-dat', 'ap-tam'])
  })
})
