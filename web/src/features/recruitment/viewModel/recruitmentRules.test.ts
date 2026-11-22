import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDayAt } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { RecruitmentRequest } from '../model/recruitmentTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const request = (overrides: Partial<RecruitmentRequest> = {}): RecruitmentRequest => ({
  name: 'Tuyển thành viên học kỳ 2',
  description: '',
  opensAt: vnDayAt(20, 8),
  closesAt: vnDayAt(35, 22),
  quotas: [{ departmentId: 'd-media', quota: 4 }],
  rounds: [
    { id: null, name: 'Lọc đơn' },
    { id: null, name: 'Phỏng vấn' },
  ],
  questions: [{ id: null, text: 'Vì sao bạn chọn ban này?', required: true }],
  judgeIds: ['u-linh'],
  ...overrides,
})
const seeded = () => {
  const found = db.recruitments.find((recruitment) => recruitment.id === 'rec-guitar-k1')
  if (!found) throw new Error('Thiếu đợt tuyển seed')
  return found
}

describe('opening a recruitment (FR-REC-01)', () => {
  it('lets members managers open one that starts upcoming, and shows it to them only', async () => {
    signInAs('u-anh')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('MANAGE_RECRUITMENT')
    const created = await recruitmentRepository.create('c-guitar', request())
    expect(created).toMatchObject({ status: 'UPCOMING', quotaTotal: 4, roundCount: 2, structureLocked: false, allowedActions: ['EDIT'], judges: [{ id: 'u-linh' }], version: 1 })
    expect(created.rounds.every((round) => round.id.length > 0)).toBe(true)
    const list = await recruitmentRepository.list('c-guitar')
    expect(list.content.map((row) => [row.id, row.status])).toEqual(expect.arrayContaining([[created.id, 'UPCOMING'], ['rec-guitar-k1', 'OPEN']]))

    signInAs('u-ha')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('MANAGE_RECRUITMENT')
    expect(await fail(recruitmentRepository.list('c-guitar'))).toMatchObject({ status: 403 })
    expect(await fail(recruitmentRepository.get('c-guitar', created.id))).toMatchObject({ status: 403 })
    expect(await fail(recruitmentRepository.create('c-guitar', request()))).toMatchObject({ status: 403 })
  })

  it('checks every field and names the row at fault', async () => {
    signInAs('u-anh')
    const error = await fail(
      recruitmentRepository.create(
        'c-guitar',
        request({
          name: 'ab',
          closesAt: vnDayAt(19, 8),
          quotas: [
            { departmentId: 'd-media', quota: 0 },
            { departmentId: 'd-media', quota: 3 },
            { departmentId: 'd-photo', quota: 3 },
          ],
          rounds: [
            { id: null, name: 'Lọc đơn' },
            { id: null, name: 'lọc đơn' },
          ],
          questions: [{ id: null, text: 'Hi', required: false }],
          // Thử việc chưa làm giám khảo được.
          judgeIds: ['u-thao'],
        }),
      ),
    )
    expect(error).toMatchObject({ status: 400 })
    expect(fields(error)).toEqual(['name', 'closesAt', 'quotas[0].quota', 'quotas[1].departmentId', 'quotas[2].departmentId', 'rounds[1].name', 'questions[0].text', 'judgeIds'])
    expect(fields(await fail(recruitmentRepository.create('c-guitar', request({ rounds: [], quotas: [] }))))).toEqual(['quotas', 'rounds'])
    const sixRounds = Array.from({ length: 6 }, (_, index) => ({ id: null, name: `Vòng ${index + 1}` }))
    expect(fields(await fail(recruitmentRepository.create('c-guitar', request({ rounds: sixRounds }))))).toEqual(['rounds'])
  })

  it('offers only official members as judges', async () => {
    signInAs('u-anh')
    const candidates = await recruitmentRepository.judgeCandidates('c-guitar')
    expect(candidates.some((candidate) => candidate.id === 'u-linh')).toBe(true)
    expect(candidates.some((candidate) => candidate.id === 'u-thao')).toBe(false)
    expect((await recruitmentRepository.judgeCandidates('c-guitar', 'Khánh Linh')).map((candidate) => candidate.id)).toEqual(['u-linh'])
  })
})

describe('editing a recruitment (FR-REC-01, NFR-REL-03)', () => {
  it('edits everything before it opens, keeping the ids of rounds that stay', async () => {
    signInAs('u-anh')
    const created = await recruitmentRepository.create('c-guitar', request())
    const [first] = created.rounds
    const saved = await recruitmentRepository.update('c-guitar', created.id, {
      rounds: [{ id: first?.id ?? null, name: 'Lọc hồ sơ' }],
      opensAt: vnDayAt(21, 8),
      version: created.version,
    })
    expect(saved.rounds).toEqual([{ id: first?.id, name: 'Lọc hồ sơ' }])
    expect(saved.version).toBe(2)
  })

  it('locks the opening time, rounds and questions once open; the closing time only moves later', async () => {
    signInAs('u-anh')
    const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(detail).toMatchObject({ status: 'OPEN', structureLocked: true })
    const sameRounds = detail.rounds.map((round) => ({ id: round.id, name: round.name }))
    const renamed = await recruitmentRepository.update('c-guitar', detail.id, { name: 'Tuyển thành viên K1', rounds: sameRounds, version: detail.version })
    expect(renamed.name).toBe('Tuyển thành viên K1')

    const locked = await fail(recruitmentRepository.update('c-guitar', detail.id, { rounds: [...sameRounds, { id: null, name: 'Thử thách' }], version: renamed.version }))
    expect(locked).toMatchObject({ status: 422, code: 'RECRUITMENT_STARTED' })
    expect(await fail(recruitmentRepository.update('c-guitar', detail.id, { opensAt: vnDayAt(-4, 8), version: renamed.version }))).toMatchObject({ code: 'RECRUITMENT_STARTED' })
    expect(fields(await fail(recruitmentRepository.update('c-guitar', detail.id, { closesAt: vnDayAt(9, 22), version: renamed.version })))).toEqual(['closesAt'])
    const later = await recruitmentRepository.update('c-guitar', detail.id, { closesAt: vnDayAt(12, 22), quotas: [{ departmentId: 'd-music', quota: 6 }], version: renamed.version })
    expect(later).toMatchObject({ quotaTotal: 6 })
  })

  it('checks rights, then version, then state, then the fields', async () => {
    signInAs('u-ha')
    expect(await fail(recruitmentRepository.update('c-guitar', 'rec-guitar-k1', { name: 'x', version: 99 }))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(recruitmentRepository.update('c-guitar', 'rec-guitar-k1', { name: 'x', version: 99 }))).toMatchObject({ status: 409 })
    seeded().finalizedAt = vnDayAt(0, 8)
    expect(await fail(recruitmentRepository.update('c-guitar', 'rec-guitar-k1', { name: 'x', version: seeded().version }))).toMatchObject({ status: 422, code: 'RECRUITMENT_FINALIZED' })
    seeded().finalizedAt = null
    expect(fields(await fail(recruitmentRepository.update('c-guitar', 'rec-guitar-k1', { name: 'x', version: seeded().version })))).toEqual(['name'])
    expect(await fail(recruitmentRepository.get('c-guitar', 'rec-khong-co'))).toMatchObject({ status: 404 })
  })

  it('stays editable after a judge goes on leave or a quota department closes, and refuses only new ineligible judges', async () => {
    const linh = db.memberships.find((membership) => membership.userId === 'u-linh' && membership.clubId === 'c-guitar')
    if (linh) linh.status = 'ON_LEAVE'
    const media = db.departments.find((department) => department.id === 'd-media')
    if (media) media.status = 'CLOSED'
    signInAs('u-anh')
    const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    const renamed = await recruitmentRepository.update('c-guitar', detail.id, { name: 'Tuyển thành viên K1', version: detail.version })
    expect(renamed.judges.map((judge) => judge.id)).toContain('u-linh')
    // Thêm người không đủ điều kiện mới bị chặn; bỏ người cũ thì được.
    expect(fields(await fail(recruitmentRepository.update('c-guitar', detail.id, { judgeIds: ['u-linh', 'u-thao'], version: renamed.version })))).toEqual(['judgeIds'])
    await expect(recruitmentRepository.update('c-guitar', detail.id, { judgeIds: ['u-ha'], version: renamed.version })).resolves.toMatchObject({ judges: [{ id: 'u-ha' }] })
  })

  it('reads as reviewing after it closes and can still be renamed', async () => {
    seeded().closesAt = vnDayAt(-1, 22)
    signInAs('u-anh')
    const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    expect(detail.status).toBe('REVIEWING')
    await expect(recruitmentRepository.update('c-guitar', detail.id, { name: 'Tuyển K1 (đang xét)', version: detail.version })).resolves.toMatchObject({ name: 'Tuyển K1 (đang xét)' })
  })
})
