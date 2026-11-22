import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { ClubReportsPage } from '../view/ClubReportsPage'
import { clubReportTabs, departmentTotals, sumAttendance, useClubReportsViewModel } from './useClubReportsViewModel'

const tally = (present: number, late: number, excused: number, absent: number) => ({ present, late, excused, absent, total: present + late + excused + absent, rate: null })

async function wrapperAs(userId: string, path: string) {
  signInAs(userId)
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(path)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('club report helpers (FR-RPT-03, 04)', () => {
  it('shows tabs by permission', () => {
    expect(clubReportTabs(['VIEW_CLUB_REPORT', 'VIEW_DEPARTMENT_REPORTS', 'VIEW_AUDIT_LOG']).map((tab) => tab.value)).toEqual(['club', 'department', 'audit'])
    expect(clubReportTabs(['VIEW_DEPARTMENT_REPORTS']).map((tab) => tab.value)).toEqual(['department'])
    expect(clubReportTabs(['MANAGE_MEMBERS'])).toEqual([])
  })

  it('adds counts before working out the rate, rather than averaging rates', () => {
    // 1/1 và 1/3: trung bình tỷ lệ là 67%, tính lại từ số đếm là 2/4.
    expect(sumAttendance([tally(1, 0, 0, 0), tally(1, 0, 1, 2)])).toEqual({ present: 2, late: 0, excused: 1, absent: 2, total: 5, rate: 0.5 })
    expect(sumAttendance([tally(0, 0, 2, 0)]).rate).toBeNull()
    expect(sumAttendance([]).rate).toBeNull()
    const totals = departmentTotals([
      { person: { id: 'a', fullName: 'A' }, status: 'ACTIVE', positionTitle: null, tasks: { doneOnTime: 1, doneLate: 0, open: 2, overdue: 1 }, attendance: tally(1, 1, 0, 0) },
      { person: { id: 'b', fullName: 'B' }, status: 'ACTIVE', positionTitle: null, tasks: { doneOnTime: 2, doneLate: 1, open: 0, overdue: 0 }, attendance: tally(0, 0, 0, 2) },
    ])
    expect(totals.tasks).toEqual({ doneOnTime: 3, doneLate: 1, open: 2, overdue: 1 })
    expect(totals.attendance.rate).toBe(0.5)
  })
})

describe('useClubReportsViewModel (FR-RPT-03, 04)', () => {
  it('opens the department tab for a head, on their own department', async () => {
    const wrapper = await wrapperAs('u-linh', '/clubs/c-guitar/reports?tab=club')
    const { result } = renderHook(() => useClubReportsViewModel(), { wrapper })
    expect(result.current.tab).toBe('department')
    await waitFor(() => expect(result.current.departmentReport?.department.id).toBe('d-media'))
    expect(result.current.departments).toHaveLength(1)
  })

  it('explains a bad period instead of offering a retry', async () => {
    const wrapper = await wrapperAs('u-anh', '/clubs/c-guitar/reports?period=MONTH&key=1999-01')
    const { result } = renderHook(() => useClubReportsViewModel(), { wrapper })
    await waitFor(() => expect(result.current.invalidReasons).toEqual(['Kỳ không có trong danh sách chọn được.']))
    expect(result.current.error).toBeNull()
  })
})

describe('ClubReportsPage', () => {
  it('shows the club report sections to the board', async () => {
    const wrapper = await wrapperAs('u-anh', '/clubs/c-guitar/reports')
    render(<ClubReportsPage />, { wrapper })
    for (const name of ['Thành viên', 'Chuyên cần', 'Sự kiện', 'Thu chi']) expect(await screen.findByRole('region', { name })).toBeInTheDocument()
    expect(within(screen.getByRole('tablist', { name: 'Loại báo cáo' })).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Báo cáo CLB', 'Báo cáo ban', 'Nhật ký'])
  })

  it('says so when the member has no report to see', async () => {
    const wrapper = await wrapperAs('u-ha', '/clubs/c-guitar/reports')
    render(<ClubReportsPage />, { wrapper })
    expect(screen.getByText('Bạn chưa xem được báo cáo nào')).toBeInTheDocument()
  })
})
