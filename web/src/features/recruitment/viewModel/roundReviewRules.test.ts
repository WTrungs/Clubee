import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDayAt } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { RoundResultRequest } from '../model/recruitmentTypes'
import { parseScore, reviewActionsOf } from './useRoundReviewViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const SCREEN = 'rr-k1-screen'
const INTERVIEW = 'rr-k1-interview'
const versionOf = (id: string) => db.applications.find((application) => application.id === id)?.version ?? 0
const review = (applicationId: string, roundId: string, body: Omit<RoundResultRequest, 'version'>, version = versionOf(applicationId)) =>
  recruitmentRepository.reviewRound('c-guitar', 'rec-guitar-k1', applicationId, roundId, { ...body, version })
const pass = (score: number, note = '') => ({ result: 'PASS' as const, score, note })
const reject = (note: string) => ({ result: 'FAIL' as const, score: null, note })

describe('reviewing applications round by round (FR-REC-03)', () => {
  it('moves a passed application to the next round and adds up the scores', async () => {
    signInAs('u-anh')
    const before = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(before.roundStats).toEqual([
      { roundId: SCREEN, pending: 1, passed: 1, failed: 0 },
      { roundId: INTERVIEW, pending: 1, passed: 0, failed: 0 },
    ])
    const dat = await review('ap-dat', SCREEN, pass(70, 'Có kinh nghiệm.'))
    expect(dat).toMatchObject({ currentRoundId: INTERVIEW, totalScore: 70, status: 'SUBMITTED', roundResults: [{ roundId: SCREEN, result: 'PASS', score: 70, by: { id: 'u-anh' }, editable: true }] })
    const done = await review('ap-dat', INTERVIEW, pass(85))
    expect(done).toMatchObject({ currentRoundId: null, totalScore: 155 })
    // Vòng sau đã có kết quả nên vòng trước khóa.
    expect(done.roundResults.map((result) => result.editable)).toEqual([false, true])

    const pending = await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { roundId: INTERVIEW, roundState: 'PENDING' })
    expect(pending.content.map((row) => row.id)).toEqual(['ap-tu'])
    const passed = await recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { roundId: INTERVIEW, roundState: 'PASSED' })
    expect(passed.content.map((row) => row.id)).toEqual(['ap-dat'])
  })

  it('eliminates on a fail with a note, and can be corrected while the next round is empty', async () => {
    signInAs('u-mai')
    const failed = await review('ap-dat', SCREEN, reject('Chưa phù hợp lịch sinh hoạt.'))
    expect(failed).toMatchObject({ status: 'ELIMINATED', currentRoundId: null })
    expect(await fail(review('ap-dat', INTERVIEW, pass(90)))).toMatchObject({ status: 422, code: 'ROUND_NOT_REACHED' })
    const corrected = await review('ap-dat', SCREEN, pass(60, 'Đã trao đổi lại lịch.'))
    expect(corrected).toMatchObject({ status: 'SUBMITTED', currentRoundId: INTERVIEW })

    await review('ap-dat', INTERVIEW, pass(75))
    expect(await fail(review('ap-dat', SCREEN, pass(65)))).toMatchObject({ status: 422, code: 'ROUND_LOCKED' })
  })

  it('checks rights, version, state and fields in that order', async () => {
    signInAs('u-linh')
    expect(await fail(review('ap-dat', SCREEN, pass(500)))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(review('ap-dat', SCREEN, pass(500), 99))).toMatchObject({ status: 409 })
    expect(fields(await fail(review('ap-dat', SCREEN, pass(101))))).toEqual(['score'])
    expect(fields(await fail(review('ap-dat', SCREEN, { result: 'PASS', score: 7.5, note: '' })))).toEqual(['score'])
    expect(fields(await fail(review('ap-dat', SCREEN, reject('ngắn'))))).toEqual(['note'])
    expect(await fail(recruitmentRepository.applications('c-guitar', 'rec-guitar-k1', { roundState: 'PENDING' }))).toMatchObject({ status: 400 })

    signInAs('u-dat')
    const mine = (await recruitmentRepository.myApplications())[0]
    if (mine) await recruitmentRepository.withdraw(mine.id, mine.version)
    signInAs('u-anh')
    expect(await fail(review('ap-dat', SCREEN, pass(80)))).toMatchObject({ status: 422, code: 'APPLICATION_WITHDRAWN' })

    const seeded = db.recruitments.find((recruitment) => recruitment.id === 'rec-guitar-k1')
    if (seeded) seeded.finalizedAt = vnDayAt(0, 8)
    expect(await fail(review('ap-tu', INTERVIEW, pass(80)))).toMatchObject({ status: 422, code: 'RECRUITMENT_FINALIZED' })
    expect((await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')).allowedActions).not.toContain('REVIEW_ROUNDS')
  })
})

describe('round review helpers (FR-REC-03)', () => {
  it('reads scores 0–100 and offers the right actions per row', () => {
    expect(parseScore('0')).toBe(0)
    expect(parseScore(' 100 ')).toBe(100)
    expect(parseScore('101')).toBeNull()
    expect(parseScore('7.5')).toBeNull()
    const row = { currentRoundId: INTERVIEW, roundResults: [{ roundId: SCREEN, editable: false }] } as Parameters<typeof reviewActionsOf>[0]
    expect(reviewActionsOf(row, INTERVIEW, true)).toEqual(['PASS', 'FAIL'])
    expect(reviewActionsOf(row, SCREEN, true)).toEqual([])
    expect(reviewActionsOf({ ...row, roundResults: [{ ...row.roundResults[0]!, editable: true }] }, SCREEN, true)).toEqual(['EDIT'])
    expect(reviewActionsOf(row, INTERVIEW, false)).toEqual([])
  })
})
