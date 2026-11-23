import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { tallyAttendance } from '@/api/mocks/mockAttendanceStats'
import { taskTallyOf } from '@/api/mocks/mockTaskStats'
import { vnDate, vnDayAt } from '@/api/mocks/mockTime'
import type { DbTask } from '@/api/mocks/seed/taskSeed'
import { signInAs } from '@/testUtils'
import { myReportRepository } from '../model/myReportRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const lastMonth = { period: 'CUSTOM' as const, from: vnDate(-30), to: vnDate(0) }

describe('attendance rate (FR-RPT-02)', () => {
  it('counts present and late over the records that were not excused', () => {
    expect(tallyAttendance(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'])).toEqual({ present: 1, late: 1, excused: 1, absent: 1, total: 4, rate: 2 / 3 })
    expect(tallyAttendance(['EXCUSED', 'EXCUSED']).rate).toBeNull()
    expect(tallyAttendance([]).rate).toBeNull()
  })
})

describe('task tally (FR-RPT-02)', () => {
  const task = (fields: Partial<DbTask>): DbTask =>
    ({ id: 't', clubId: 'c-guitar', ownerId: 'u-ha', status: 'ASSIGNED', dueAt: vnDayAt(-1, 23), history: [], ...fields }) as DbTask
  const doneAt = (at: string) => [{ id: 'h', at, actorId: 'u-ha', fromStatus: 'PENDING_REVIEW' as const, toStatus: 'DONE' as const, note: null }]

  it('splits work done in the period into on time and late, and counts open and overdue work now', () => {
    const tasks = [
      task({ id: 'on-time', status: 'DONE', dueAt: vnDayAt(-2, 23), history: doneAt(vnDayAt(-3, 10)) }),
      task({ id: 'late', status: 'DONE', dueAt: vnDayAt(-5, 23), history: doneAt(vnDayAt(-4, 10)) }),
      task({ id: 'before', status: 'DONE', dueAt: vnDayAt(-60, 23), history: doneAt(vnDayAt(-60, 10)) }),
      task({ id: 'overdue', status: 'IN_PROGRESS', dueAt: vnDayAt(-1, 23) }),
      task({ id: 'open', status: 'PENDING_REVIEW', dueAt: vnDayAt(5, 23) }),
      task({ id: 'cancelled', status: 'CANCELLED' }),
      task({ id: 'someone else', ownerId: 'u-vy', status: 'IN_PROGRESS' }),
    ]
    expect(taskTallyOf(tasks, 'u-ha', { from: vnDate(-30), to: vnDate(0) })).toEqual({ doneOnTime: 1, doneLate: 1, open: 2, overdue: 1 })
  })
})

describe('my club history and report (FR-ATT-10, FR-RPT-02)', () => {
  it('lists current clubs before clubs left, without pending requests', async () => {
    signInAs('u-ha')
    expect((await myReportRepository.clubHistory()).map((row) => [row.clubId, row.status])).toEqual([
      ['c-guitar', 'ACTIVE'],
      ['c-english', 'ACTIVE'],
    ])
    signInAs('u-phuong')
    expect(await myReportRepository.clubHistory()).toMatchObject([{ clubId: 'c-guitar', status: 'LEFT', departmentName: 'Truyền thông' }])
  })

  it('shows only my own attendance in the period, with the rate', async () => {
    signInAs('u-ha')
    const page = await myReportRepository.attendance({ clubId: 'c-guitar', ...lastMonth })
    expect(page.content.map((row) => [row.activity.id, row.status])).toEqual(
      expect.arrayContaining([
        ['s-weekly-now', 'EXCUSED'],
        ['s-media-photo', 'PRESENT'],
        ['e-livestream', 'PRESENT'],
      ]),
    )
    expect(page.content.map((row) => row.activity.id)).not.toContain('e-exchange')
    expect(page.tally).toMatchObject({ present: 2, excused: 1, total: 3, rate: 1 })
    const dates = page.content.map((row) => row.date)
    expect(dates).toEqual(dates.toSorted().reverse())
  })

  it('still lets someone who left see their own history and report', async () => {
    db.attendance.push({
      id: 'a-dat-old',
      activityType: 'SESSION',
      activityId: 's-media-photo',
      day: null,
      userId: 'u-dat',
      status: 'ABSENT',
      method: 'MANUAL',
      extra: true,
      recordedBy: 'u-linh',
      recordedAt: vnDayAt(-7, 20),
      changes: [],
      version: 1,
    })
    signInAs('u-dat')
    expect((await myReportRepository.clubHistory())[0]).toMatchObject({ clubId: 'c-guitar', status: 'LEFT' })
    expect((await myReportRepository.periods('c-guitar')).months.length).toBe(12)
    const page = await myReportRepository.attendance({ clubId: 'c-guitar', ...lastMonth })
    expect(page.content.map((row) => row.id)).toEqual(['a-dat-old'])
    const report = await myReportRepository.report({ clubId: 'c-guitar', ...lastMonth })
    expect(report.attendance).toMatchObject({ absent: 1, rate: 0 })
  })

  it('reports tasks and dues for the period', async () => {
    signInAs('u-ha')
    const report = await myReportRepository.report({ clubId: 'c-guitar', period: 'CUSTOM', from: vnDate(-30), to: vnDate(30) })
    expect(report.range).toEqual({ label: 'Khoảng ngày tự chọn', from: vnDate(-30), to: vnDate(30) })
    expect(report.dues.map((row) => row.campaignId)).toContain('dues-guitar-hk1')
    expect(report.tasks).toEqual(taskTallyOf(db.tasks.filter((task) => task.clubId === 'c-guitar'), 'u-ha', report.range))
  })

  it('refuses clubs I never joined and invalid periods', async () => {
    signInAs('u-tu')
    expect(await fail(myReportRepository.report({ clubId: 'c-guitar', ...lastMonth }))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
    signInAs('u-quan')
    expect(await fail(myReportRepository.periods('c-guitar'))).toMatchObject({ status: 403 })
    signInAs('u-ha')
    expect(await fail(myReportRepository.report({ clubId: 'c-guitar', period: 'MONTH', key: '1999-01' }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'key' }] })
  })
})
