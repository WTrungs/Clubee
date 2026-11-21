import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { orgRepository } from '@/features/org/model/orgRepository'
import { daysBetween, termExtensionProblem } from '@/shared/lib/termExtensionRules'
import { signInAs } from '@/testUtils'
import { termRepository } from '../model/termRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const term = () => db.terms.find((candidate) => candidate.id === 't-guitar-2026')
const versionOf = () => term()?.version ?? 0
const extend = (endOn: string, reason = 'Lùi đại hội vì trùng lịch thi.', version = versionOf()) => termRepository.extend('c-guitar', 't-guitar-2026', { endOn, reason, version })
const position = (id: string) => db.positions.find((candidate) => candidate.id === id)

describe('extension date rule (FR-TERM-02)', () => {
  it('needs a later day than both the old end and today, at most 365 days on', () => {
    expect(daysBetween('2027-01-01', '2028-01-01')).toBe(365)
    expect(daysBetween('2027-12-31', '2028-12-31')).toBe(366)
    expect(termExtensionProblem('2027-01-01', '2028-01-01', '2026-11-21')).toBeNull()
    expect(termExtensionProblem('2027-01-01', '2028-01-02', '2026-11-21')).toContain('tối đa 365 ngày')
    expect(termExtensionProblem('2027-01-01', '2027-01-01', '2026-11-21')).toContain('sau ngày kết thúc hiện tại (01/01/2027)')
    // Nhiệm kỳ quá hạn: ngày mới sau ngày cũ nhưng chưa qua hôm nay vẫn bị chặn.
    expect(termExtensionProblem('2026-11-10', '2026-11-21', '2026-11-21')).toBe('Ngày kết thúc mới phải sau hôm nay.')
  })
})

describe('extending the running term (FR-TERM-02, BR-ORG-03, BR-DATA-03)', () => {
  it('moves the standing positions ending with the term and keeps the shorter or revoked ones', async () => {
    signInAs('u-anh')
    const oldEnd = term()?.endOn ?? ''
    const shorter = grantPosition({ userId: 'u-vy', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-media', assignedBy: 'u-anh', endOn: vnDate(100) })
    const revoked = position('p-department_head-d-external-son')
    if (revoked) revoked.revokedAt = vnDate(-1)
    const before = (await termRepository.list('c-guitar')).find((candidate) => candidate.id === 't-guitar-2026')
    expect(before?.allowedActions).toContain('EXTEND')
    expect(before?.positionsEndingWithTerm).toBe(5)

    const saved = await extend(vnDate(360))
    expect(saved).toMatchObject({ endOn: vnDate(360), positionsEndingWithTerm: 5, version: 2 })
    expect(saved.extensions).toEqual([expect.objectContaining({ fromEndOn: oldEnd, toEndOn: vnDate(360), reason: 'Lùi đại hội vì trùng lịch thi.', extendedBy: expect.objectContaining({ id: 'u-anh' }), movedPositions: 5 })])
    expect(position('p-president-c-guitar-anh')?.endOn).toBe(vnDate(360))
    expect(position('p-department_head-d-media-linh')).toMatchObject({ endOn: vnDate(360), version: 2 })
    expect(position(shorter.id)?.endOn).toBe(vnDate(100))
    expect(revoked?.endOn).toBe(oldEnd)
    expect(position('p-event_lead-e-winter-bao')?.endOn).toBeNull()

    expect(db.auditLogs.filter((log) => log.action === 'TERM_EXTEND')).toEqual([
      expect.objectContaining({ actorId: 'u-anh', objectId: 't-guitar-2026', before: { endOn: oldEnd }, after: { endOn: vnDate(360), movedPositions: 5, positionIds: expect.arrayContaining(['p-president-c-guitar-anh', 'p-department_head-d-media-linh']) }, reason: 'Lùi đại hội vì trùng lịch thi.' }),
    ])
    signInAs('u-linh')
    const inbox = await notificationRepository.list({ category: 'TERM' })
    expect(inbox.content.map((notification) => notification.title)).toContain(`Nhiệm kỳ 2026–2027 được gia hạn tới ${vnDate(360).split('-').reverse().join('/')}`)
    signInAs('u-anh')
    expect((await notificationRepository.list({ category: 'TERM' })).content).toHaveLength(0)
  })

  it('lets an overdue term assign standing positions again once extended', async () => {
    signInAs('u-anh')
    const current = term()
    if (!current) throw new Error('Thiếu nhiệm kỳ seed')
    current.endOn = vnDate(-1)
    for (const candidate of db.positions) if (candidate.clubId === 'c-guitar' && candidate.endOn === vnDate(300)) candidate.endOn = vnDate(-1)
    const request = { userId: 'u-hieu', role: 'DEPARTMENT_HEAD' as const, scopeId: 'd-design', startOn: vnDate(0), endOn: vnDate(30) }
    expect(await fail(orgRepository.assign('c-guitar', request))).toMatchObject({ status: 422, code: 'TERM_OVERDUE' })

    expect(fields(await fail(extend(vnDate(0))))).toEqual(['endOn'])
    await extend(vnDate(60))
    expect(position('p-treasurer-c-guitar-mai')?.endOn).toBe(vnDate(60))
    await expect(orgRepository.assign('c-guitar', request)).resolves.toMatchObject({ role: 'DEPARTMENT_HEAD' })
  })

  it('checks rights, then version, then status, then the fields', async () => {
    signInAs('u-linh')
    expect(await fail(extend('khong-phai-ngay', ''))).toMatchObject({ status: 403 })
    expect((await termRepository.list('c-guitar')).find((candidate) => candidate.id === 't-guitar-2026')).toMatchObject({ positionsEndingWithTerm: null, allowedActions: [] })

    signInAs('u-mai')
    expect(await fail(extend('khong-phai-ngay', '', versionOf() + 1))).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    const invalid = await fail(extend(vnDate(300 + 366), 'ngắn'))
    expect(invalid).toMatchObject({ status: 400 })
    expect(fields(invalid)).toEqual(['endOn', 'reason'])
    expect(fields(await fail(extend(vnDate(300))))).toEqual(['endOn'])
    expect(term()?.extensions).toHaveLength(0)

    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    expect(await fail(termRepository.extend('c-guitar', next.id, { endOn: vnDate(700), reason: 'Thử gia hạn nhiệm kỳ chưa chạy.', version: next.version }))).toMatchObject({
      status: 422,
      code: 'TERM_NOT_RUNNING',
    })
    await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
    const handingOver = await fail(extend(vnDate(330)))
    expect(handingOver).toMatchObject({ status: 422, code: 'TERM_NOT_RUNNING' })
    expect(handingOver?.detail).toContain('đang bàn giao')
  })
})
