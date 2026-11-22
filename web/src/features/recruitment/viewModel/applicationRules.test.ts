import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDayAt } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { SubmitApplicationRequest } from '../model/recruitmentTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const request = (overrides: Partial<SubmitApplicationRequest> = {}): SubmitApplicationRequest => ({
  choices: ['d-music', 'd-media'],
  answers: [
    { questionId: 'rq-k1-why', text: 'Muốn học đàn cùng mọi người.' },
    { questionId: 'rq-k1-instrument', text: 'Chưa chơi nhạc cụ nào.' },
    { questionId: 'rq-k1-time', text: '' },
  ],
  studentId: '23520123',
  ...overrides,
})
const seeded = () => {
  const found = db.recruitments.find((recruitment) => recruitment.id === 'rec-guitar-k1')
  if (!found) throw new Error('Thiếu đợt tuyển seed')
  return found
}

describe('applying to a recruitment (FR-REC-02, ST-APP)', () => {
  it('lists open recruitments for any signed-in user and takes one application per person', async () => {
    signInAs('u-tam')
    const open = await recruitmentRepository.openRecruitments()
    expect(open.content.map((row) => row.id)).toEqual(['rec-guitar-k1'])
    const before = await recruitmentRepository.publicRecruitment('rec-guitar-k1')
    expect(before).toMatchObject({ status: 'OPEN', collectsStudentId: true, myApplication: null, applyBlocker: null })

    const mine = await recruitmentRepository.apply('rec-guitar-k1', request())
    expect(mine).toMatchObject({ status: 'SUBMITTED', allowedActions: ['WITHDRAW'], studentId: '23520123', choices: [{ departmentId: 'd-music' }, { departmentId: 'd-media' }] })
    expect((await recruitmentRepository.publicRecruitment('rec-guitar-k1')).myApplication?.id).toBe(mine.id)
    expect(await fail(recruitmentRepository.apply('rec-guitar-k1', request()))).toMatchObject({ status: 409, code: 'ALREADY_APPLIED' })

    // Rút rồi cũng không nộp lại được (mỗi đợt một đơn).
    const withdrawn = await recruitmentRepository.withdraw(mine.id, mine.version)
    expect(withdrawn).toMatchObject({ status: 'WITHDRAWN', allowedActions: [] })
    expect(await fail(recruitmentRepository.apply('rec-guitar-k1', request()))).toMatchObject({ status: 409 })
    expect(await fail(recruitmentRepository.withdraw(mine.id, withdrawn.version))).toMatchObject({ status: 422, code: 'APPLICATION_NOT_WITHDRAWABLE' })
    expect((await recruitmentRepository.myApplications()).map((application) => application.status)).toEqual(['WITHDRAWN'])
    // Đơn của người khác không lộ: rút hộ thì 404.
    expect(await fail(recruitmentRepository.withdraw('ap-tu', 1))).toMatchObject({ status: 404 })
  })

  it('refuses current members, including pending ones, but lets former members apply', async () => {
    for (const userId of ['u-ha', 'u-quan', 'u-phuong']) {
      signInAs(userId)
      expect((await recruitmentRepository.publicRecruitment('rec-guitar-k1')).applyBlocker).toContain('đang là thành viên')
      expect(await fail(recruitmentRepository.apply('rec-guitar-k1', request()))).toMatchObject({ status: 422, code: 'ALREADY_MEMBER' })
    }
    signInAs('u-dat')
    expect((await recruitmentRepository.publicRecruitment('rec-guitar-k1')).myApplication).toMatchObject({ status: 'SUBMITTED' })
  })

  it('checks choices, required answers and the student id', async () => {
    signInAs('u-tam')
    const error = await fail(
      recruitmentRepository.apply(
        'rec-guitar-k1',
        request({ choices: ['d-music', 'd-music'], answers: [{ questionId: 'rq-k1-why', text: ' ' }], studentId: 'ab' }),
      ),
    )
    expect(error).toMatchObject({ status: 400 })
    expect(fields(error)).toEqual(['choices', 'answers[0].text', 'answers[1].text', 'studentId'])
    expect(fields(await fail(recruitmentRepository.apply('rec-guitar-k1', request({ choices: ['d-design'] }))))).toEqual(['choices'])
    expect(fields(await fail(recruitmentRepository.apply('rec-guitar-k1', request({ choices: ['d-music', 'd-media', 'd-logistics', 'd-design'] }))))).toEqual(['choices'])
    expect(fields(await fail(recruitmentRepository.apply('rec-guitar-k1', request({ choices: [] }))))).toEqual(['choices'])
  })

  it('takes applications only while open and hides recruitments not yet open from outsiders', async () => {
    seeded().closesAt = vnDayAt(-1, 22)
    signInAs('u-tam')
    expect(await fail(recruitmentRepository.apply('rec-guitar-k1', request()))).toMatchObject({ status: 422, code: 'RECRUITMENT_NOT_OPEN' })
    expect((await recruitmentRepository.openRecruitments()).content).toHaveLength(0)
    signInAs('u-tu')
    const tu = (await recruitmentRepository.myApplications())[0]
    expect(tu?.allowedActions).toEqual([])

    // Đợt đã đóng nhận đơn: người không có đơn, không thuộc CLB không xem được nữa.
    signInAs('u-tam')
    expect(await fail(recruitmentRepository.publicRecruitment('rec-guitar-k1'))).toMatchObject({ status: 404 })
    Object.assign(seeded(), { opensAt: vnDayAt(3, 8), closesAt: vnDayAt(10, 22) })
    signInAs('u-tam')
    expect(await fail(recruitmentRepository.publicRecruitment('rec-guitar-k1'))).toMatchObject({ status: 404 })
  })
})

describe('reading applications on the board side (FR-REC-02, SRS 3.5)', () => {
  it('shows the board every application with filters, and nobody else', async () => {
    signInAs('u-anh')
    const all = await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', {})
    expect(all.content.map((row) => row.applicant.id)).toEqual(['u-tu', 'u-dat'])
    expect((await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { departmentId: 'd-media' })).content.map((row) => row.id)).toEqual(['ap-tu'])
    expect((await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { q: 'Đạt' })).content.map((row) => row.id)).toEqual(['ap-dat'])
    const detail = await recruitmentRepository.application('c-guitar', 'rec-guitar-k1', 'ap-tu')
    expect(detail.answers.map((answer) => answer.question)).toEqual(seeded().questions.map((question) => question.text))
    expect((await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')).applicationCount).toBe(2)

    for (const userId of ['u-linh', 'u-ha']) {
      signInAs(userId)
      expect(await fail(recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', {}))).toMatchObject({ status: 403 })
      expect(await fail(recruitmentRepository.application('c-guitar', 'rec-guitar-k1', 'ap-tu'))).toMatchObject({ status: 403 })
    }
  })
})
