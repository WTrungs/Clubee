import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { financeReportRepository } from '@/features/finance/model/financeReportRepository'
import { toVnDateKey } from '@/shared/format/formatDate'
import { signInAs } from '@/testUtils'
import { clubReportRepository } from '../model/clubReportRepository'
import type { ClubReportQuery } from '../model/clubReportTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const LAST_30: ClubReportQuery = { period: 'CUSTOM', from: vnDate(-30), to: vnDate(0) }

describe('club report (FR-RPT-04)', () => {
  it('counts members now, joins and leaves in the period, without rejected requests', async () => {
    signInAs('u-anh')
    const before = (await clubReportRepository.clubReport('c-guitar', LAST_30)).members
    const guitar = db.memberships.filter((membership) => membership.clubId === 'c-guitar')
    expect(before).toMatchObject({
      probation: guitar.filter((membership) => membership.status === 'PROBATION').length,
      active: guitar.filter((membership) => membership.status === 'ACTIVE').length,
      onLeave: guitar.filter((membership) => membership.status === 'ON_LEAVE').length,
    })
    const template = guitar.find((membership) => membership.userId === 'u-ha')!
    db.memberships.push(
      { ...template, id: 'm-new', userId: 'u-tam', joinedOn: vnDate(-3), status: 'PROBATION' },
      { ...template, id: 'm-gone', userId: 'u-tu', joinedOn: vnDate(-200), leftOn: vnDate(-2), status: 'LEFT', exitKind: 'RESIGNED' },
      { ...template, id: 'm-rejected', userId: 'u-khanh', joinedOn: null, leftOn: vnDate(-2), status: 'LEFT', exitKind: 'REJECTED' },
    )
    const after = (await clubReportRepository.clubReport('c-guitar', LAST_30)).members
    expect(after.joined - before.joined).toBe(1)
    expect(after.left - before.left).toBe(1)
    expect(after.probation - before.probation).toBe(1)
  })

  it('tallies each session in the period with the shared rate formula, and matches the finance report', async () => {
    signInAs('u-anh')
    const report = await clubReportRepository.clubReport('c-guitar', LAST_30)
    expect(report.range).toEqual({ label: 'Khoảng ngày tự chọn', from: vnDate(-30), to: vnDate(0) })
    const photo = report.attendance.sessions.find((row) => row.sessionId === 's-media-photo')
    expect(photo).toMatchObject({ closed: true, date: vnDate(-7), tally: { present: 3, absent: 1, total: 4, rate: 0.75 } })
    const song = report.attendance.sessions.find((row) => row.sessionId === 's-song-1')
    expect(song?.tally).toMatchObject({ present: 3, late: 1, excused: 1, absent: 1, rate: 0.8 })
    expect(report.attendance.overall.total).toBe(report.attendance.sessions.reduce((sum, row) => sum + row.tally.total, 0))
    // Buổi bị hủy không tính.
    const cancelled = db.sessions.find((session) => session.id === 's-song-1')
    if (cancelled) cancelled.cancelledAt = vnDate(-6)
    expect((await clubReportRepository.clubReport('c-guitar', LAST_30)).attendance.sessions.some((row) => row.sessionId === 's-song-1')).toBe(false)

    const finance = await financeReportRepository.get('c-guitar', { period: 'CUSTOM', from: vnDate(-30), to: vnDate(0) })
    expect(report.finance).toMatchObject({ income: finance.totalIncome, expense: finance.totalExpense, net: finance.net })
  })

  it('counts events starting in the period by status, leaving drafts out', async () => {
    signInAs('u-anh')
    const { events } = await clubReportRepository.clubReport('c-guitar', LAST_30)
    const expected = db.events.filter((event) => event.clubId === 'c-guitar' && event.status !== 'DRAFT' && toVnDateKey(event.startAt) >= vnDate(-30) && toVnDateKey(event.startAt) <= vnDate(0))
    expect(events.total).toBe(expected.length)
    expect(events.byStatus).toContainEqual({ status: 'ENDED', count: 1 })
    expect(events.byStatus.every((row) => row.count > 0)).toBe(true)
  })

  it('is for the board only, and checks the period', async () => {
    signInAs('u-linh')
    expect(await fail(clubReportRepository.clubReport('c-guitar', LAST_30))).toMatchObject({ status: 403 })
    signInAs('u-ha')
    expect(await fail(clubReportRepository.periods('c-guitar'))).toMatchObject({ status: 403 })
    expect(await clubReportRepository.departments('c-guitar')).toEqual([])
    signInAs('u-tu')
    expect(await fail(clubReportRepository.clubReport('c-guitar', LAST_30))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
    signInAs('u-anh')
    expect(await fail(clubReportRepository.clubReport('c-guitar', { period: 'CUSTOM', from: vnDate(0), to: vnDate(-1) }))).toMatchObject({ status: 400 })
    expect(await fail(clubReportRepository.clubReport('c-guitar', { period: 'MONTH', key: '1999-01' }))).toMatchObject({ status: 400 })
  })
})

describe('department report (FR-RPT-03)', () => {
  it('lists the members of the department, head first, with tasks and attendance', async () => {
    signInAs('u-linh')
    expect(await clubReportRepository.departments('c-guitar')).toEqual([{ id: 'd-media', name: 'Truyền thông' }])
    const report = await clubReportRepository.departmentReport('c-guitar', 'd-media', LAST_30)
    expect(report.rows[0]).toMatchObject({ person: { id: 'u-linh' }, positionTitle: 'Trưởng ban' })
    expect(report.rows.map((row) => row.person.id)).toEqual(expect.arrayContaining(['u-ha', 'u-vy', 'u-yen']))
    expect(report.rows.find((row) => row.person.id === 'u-yen')?.status).toBe('ON_LEAVE')
    const ha = report.rows.find((row) => row.person.id === 'u-ha')
    expect(ha?.attendance.present).toBeGreaterThanOrEqual(1)
    expect(Object.keys(ha?.tasks ?? {})).toEqual(['doneOnTime', 'doneLate', 'open', 'overdue'])
  })

  it('keeps heads to their own department and gives the board every active one', async () => {
    signInAs('u-linh')
    expect(await fail(clubReportRepository.departmentReport('c-guitar', 'd-logistics', LAST_30))).toMatchObject({ status: 403 })
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toEqual(expect.arrayContaining(['VIEW_DEPARTMENT_REPORTS']))
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('VIEW_CLUB_REPORT')
    signInAs('u-huy')
    const active = db.departments.filter((department) => department.clubId === 'c-guitar' && department.status === 'ACTIVE')
    expect((await clubReportRepository.departments('c-guitar')).map((option) => option.id).toSorted()).toEqual(active.map((department) => department.id).toSorted())
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toEqual(expect.arrayContaining(['VIEW_CLUB_REPORT', 'VIEW_DEPARTMENT_REPORTS', 'VIEW_AUDIT_LOG']))
    expect(await fail(clubReportRepository.departmentReport('c-guitar', 'd-en-content', LAST_30))).toMatchObject({ status: 404 })
    signInAs('u-ha')
    expect(await fail(clubReportRepository.departmentReport('c-guitar', 'd-media', LAST_30))).toMatchObject({ status: 403 })
  })
})
