import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import { capacityLabel, donePercent, presentDaysLabel, progressSummary, staffRoleLabel } from '../viewModel/useEventReportViewModel'
import { EventReportTab } from './EventReportTab'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const counts = (patch: Partial<Parameters<typeof progressSummary>[0]>) => ({ total: 0, assigned: 0, inProgress: 0, pendingReview: 0, done: 0, overdue: 0, ...patch })

describe('event report display (FR-RPT-05, FR-EVT-09)', () => {
  it('rounds the done share down and says when there is nothing yet', () => {
    expect(donePercent({ total: 0, done: 0 })).toBeNull()
    expect(donePercent({ total: 3, done: 2 })).toBe(66)
    expect(donePercent({ total: 250, done: 249 })).toBe(99)
    expect(progressSummary(counts({}))).toBe('Chưa có việc')
    expect(progressSummary(counts({ total: 5, done: 3, overdue: 1 }))).toBe('3/5 việc hoàn thành · 1 quá hạn')
  })

  it('names the staff role and the days present', () => {
    expect(staffRoleLabel({ role: 'LEAD', subcommitteeName: null })).toBe('Trưởng BTC')
    expect(staffRoleLabel({ role: 'MEMBER', subcommitteeName: 'Hậu cần' })).toBe('Tiểu ban Hậu cần')
    expect(staffRoleLabel({ role: 'COLLABORATOR', subcommitteeName: 'Hậu cần' })).toBe('CTV · Tiểu ban Hậu cần')
    expect(staffRoleLabel({ role: 'CO_HOST', subcommitteeName: null })).toBe('CLB đồng tổ chức · Chưa vào tiểu ban')
    expect(presentDaysLabel({ presentDays: 0, days: 0 })).toBe('Chưa mở điểm danh')
    expect(presentDaysLabel({ presentDays: 1, days: 2 })).toBe('1/2 ngày')
    expect(capacityLabel(null)).toBe('Không giới hạn')
    expect(capacityLabel(12)).toBe('12')
  })
})

describe('event report numbers (FR-RPT-05, FR-RPT-03)', () => {
  it('counts registrations by status, staff work by person and the event fund for the lead', async () => {
    const cancelled = db.registrations.find((registration) => registration.id === 'r-winter-10')
    if (cancelled) cancelled.status = 'CANCELLED'
    signInAs('u-bao')
    const report = await eventRepository.report('c-guitar', 'e-winter')
    expect(report.registrations).toEqual({ capacity: 12, confirmed: 10, waitlisted: 0, reconfirmPending: 0, cancelled: 1 })
    // Sự kiện chưa diễn ra: có ngày điểm danh nhưng chưa ai được ghi.
    expect(report.attendance).toHaveLength(1)
    expect(report.attendance[0]).toMatchObject({ closed: false, expected: 10, tally: { total: 0, rate: null } })

    const staff = report.staff ?? []
    // Sự kiện chưa tới ngày nên chưa có ngày nào tính chuyên cần.
    expect(staff[0]).toMatchObject({ person: { id: 'u-bao' }, role: 'LEAD', subcommitteeName: null, days: 0 })
    expect(staff.map((row) => row.person.id)).toEqual(['u-bao', 'u-long', 'u-khoa', 'u-tram', 'u-linh', 'u-ha', 'u-vy', 'u-nam', 'u-kiet'])
    const tasks = db.tasks.filter((task) => task.scopeType === 'SUBCOMMITTEE' && task.scopeId.startsWith('sc-winter') && task.status !== 'CANCELLED')
    expect(staff.reduce((sum, row) => sum + row.open + row.done, 0)).toBe(tasks.filter((task) => staff.some((row) => row.person.id === task.ownerId)).length)
    expect(report.tasks.total.total).toBe(tasks.length)

    expect(report.fund).toEqual({ balance: 1_500_000, income: 1_500_000, expense: 0, pendingCount: 1, pendingAmount: 800_000, openAdvanceCount: 0 })
  })

  it('tallies attendance per day and counts the days each organiser was present', async () => {
    db.attendance.push({ ...db.attendance.find((record) => record.id === 'a-exchange-anh')!, id: 'a-exchange-huy', userId: 'u-huy', status: 'LATE' })
    signInAs('u-anh')
    const report = await eventRepository.report('c-guitar', 'e-exchange')
    expect(report.attendance).toEqual([{ day: vnDate(-10), closed: false, expected: 6, tally: { present: 2, late: 1, excused: 0, absent: 0, total: 3, rate: 1 } }])
    expect(report.staff).toEqual([expect.objectContaining({ person: expect.objectContaining({ id: 'u-huy' }), role: 'LEAD', presentDays: 1, days: 1, open: 0 })])
  })

  it('keeps the per-person part to the lead and the host board, and the report to organisers', async () => {
    signInAs('u-long')
    const staffView = await eventRepository.report('c-guitar', 'e-winter')
    expect(staffView.staff).toBeNull()
    // Nhân sự BTC xem quỹ nhưng không thấy khoản chờ, giống tab Quỹ.
    expect(staffView.fund).toMatchObject({ balance: 1_500_000, pendingCount: null, pendingAmount: null })
    signInAs('u-huy')
    expect((await eventRepository.report('c-guitar', 'e-winter')).staff).not.toBeNull()
    signInAs('u-thao')
    expect(await fail(eventRepository.report('c-guitar', 'e-winter'))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    // Sự kiện bị hủy không có điểm danh.
    expect((await eventRepository.report('c-guitar', 'e-acoustic-sep')).attendance).toEqual([])
  })
})

describe('EventReportTab (FR-RPT-05)', () => {
  it('shows every part to the event lead, with each subcommittee and its overdue count', async () => {
    const task = db.tasks.find((candidate) => candidate.scopeType === 'SUBCOMMITTEE' && candidate.scopeId === 'sc-winter-logistics' && candidate.status !== 'DONE' && candidate.status !== 'CANCELLED')
    if (!task) throw new Error('Thiếu việc của tiểu ban Hậu cần')
    task.dueAt = new Date(Date.now() - 86_400_000).toISOString()
    signInAs('u-bao')
    const { wrapper } = createTestWrapper()
    render(<EventReportTab clubId="c-guitar" eventId="e-winter" />, { wrapper })
    const overall = await screen.findByRole('region', { name: 'Tiến độ chung' })
    expect(within(overall).getByText('Toàn sự kiện')).toBeInTheDocument()
    const logistics = screen.getByRole('heading', { name: 'Tiểu ban Hậu cần' }).closest('li')
    if (!logistics) throw new Error('Thiếu thẻ Hậu cần')
    expect(within(logistics).getByText(/việc hoàn thành · \d+ quá hạn$/)).toBeInTheDocument()
    for (const name of ['Đăng ký', 'Điểm danh', 'Công việc', 'Theo người', 'Quỹ sự kiện']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Đăng ký' })).getByText('Nhận chỗ')).toBeInTheDocument()
  })

  it('leaves out the per-person part for staff and says when there is no subcommittee', async () => {
    signInAs('u-long')
    const { wrapper } = createTestWrapper()
    render(<EventReportTab clubId="c-guitar" eventId="e-winter" />, { wrapper })
    expect(await screen.findByRole('region', { name: 'Công việc' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Theo người' })).toBeNull()
  })

  it('says so when the event has no subcommittee', async () => {
    signInAs('u-anh')
    const { wrapper } = createTestWrapper()
    render(<EventReportTab clubId="c-guitar" eventId="e-exchange" />, { wrapper })
    expect(await screen.findByText('Chưa có tiểu ban. Công việc tính theo việc của từng tiểu ban.')).toBeInTheDocument()
  })
})
