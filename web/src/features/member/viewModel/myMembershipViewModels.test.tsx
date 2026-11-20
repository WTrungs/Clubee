import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { leaveRequestStatusDisplay, resignBlockerGroups, resignBlockerLink } from './memberDisplay'
import { useLeaveRequestsViewModel } from './useLeaveRequestsViewModel'
import { useMyMembershipViewModel } from './useMyMembershipViewModel'

async function clubWrapper(userId: string) {
  signInAs(userId)
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/members')
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

// Spy trên toast dùng chung giữa các test; khôi phục để lời gọi của test trước không làm test sau đạt nhầm.
afterEach(() => vi.restoreAllMocks())

const newTask = (ownerId: string) => ({ ...db.tasks[0], id: 't-new', clubId: 'c-guitar', ownerId, status: 'ASSIGNED' }) as (typeof db.tasks)[number]

describe('leave and resign display (FR-MEM-07, BR-MEM-03)', () => {
  it('labels request statuses and resign blockers, linking tasks to My tasks only', () => {
    expect(Object.fromEntries(Object.entries(leaveRequestStatusDisplay).map(([status, display]) => [status, display.label]))).toEqual({
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Bị từ chối',
      WITHDRAWN: 'Đã rút',
      CLOSED: 'Đã đóng',
    })
    expect(resignBlockerLink({ kind: 'TASK', refId: 't-poster', title: 'Poster' }, 'c-guitar')).toBe('/me/tasks?task=t-poster&taskClub=c-guitar')
    expect(resignBlockerLink({ kind: 'TASK_REVIEW', refId: 't-a b', title: 'A' }, 'c-guitar')).toBe('/me/tasks?task=t-a%20b&taskClub=c-guitar')
    expect(resignBlockerLink({ kind: 'POSITION', refId: 'p-1', title: 'Trưởng ban' }, 'c-guitar')).toBeNull()
    expect(resignBlockerGroups.map((group) => group.kind)).toEqual(['POSITION', 'TASK', 'TASK_REVIEW', 'APPOINTMENT'])
  })
})

describe('useMyMembershipViewModel (FR-MEM-07)', () => {
  const render = async (userId: string) => {
    const wrapper = await clubWrapper(userId)
    const hook = renderHook(() => ({ vm: useMyMembershipViewModel(), location: useLocation() }), { wrapper })
    await waitFor(() => expect(hook.result.current.vm.membership).not.toBeNull())
    return hook
  }

  it('sends a leave request and shows the pending request once the server confirms', async () => {
    const { result } = await render('u-ha')
    act(() => result.current.vm.open('leave'))
    act(() => result.current.vm.confirm('Ôn thi cuối kỳ trong một tháng.'))
    await waitFor(() => expect(result.current.vm.membership?.leaveRequest?.status).toBe('PENDING'))
    expect(result.current.vm.dialog).toBeNull()
    expect(result.current.vm.can('WITHDRAW_LEAVE_REQUEST')).toBe(true)
  })

  it('closes the dialog, reports and reloads on 409 instead of sending again (NFR-REL-03)', async () => {
    const toastError = vi.spyOn(toast, 'error')
    const { result } = await render('u-ha')
    // Yêu cầu khác vừa được gửi ở thiết bị khác.
    db.leaveRequests.push({ ...db.leaveRequests[0], id: 'lr-other', membershipId: 'm-guitar-ha', userId: 'u-ha' } as (typeof db.leaveRequests)[number])
    act(() => result.current.vm.open('leave'))
    act(() => result.current.vm.confirm('Ôn thi cuối kỳ trong một tháng.'))
    await waitFor(() => expect(result.current.vm.dialog).toBeNull())
    expect(toastError).toHaveBeenCalledWith('Bạn đã có yêu cầu tạm nghỉ đang chờ ban chủ nhiệm duyệt.')
    await waitFor(() => expect(result.current.vm.membership?.leaveRequest?.id).toBe('lr-other'))
    expect(db.leaveRequests.filter((leave) => leave.userId === 'u-ha')).toHaveLength(1)
  })

  it('reloads what is still owed when the resign dialog opens, even within the cache time', async () => {
    const { result } = await render('u-tram')
    expect(result.current.vm.membership?.resignBlockers).toEqual([])
    db.tasks.push(newTask('u-tram'))
    act(() => result.current.vm.open('resign'))
    await waitFor(() => expect(result.current.vm.membership?.resignBlockers.map((blocker) => blocker.refId)).toEqual(['t-new']))
    expect(result.current.vm.checking).toBe(false)
  })

  it('keeps the resign dialog open with the reason when the server still finds something owed', async () => {
    const { result } = await render('u-tram')
    act(() => result.current.vm.open('resign'))
    await waitFor(() => expect(result.current.vm.checking).toBe(false))
    db.tasks.push(newTask('u-tram'))
    act(() => result.current.vm.confirm('Chuyển trường vào học kỳ sau.'))
    await waitFor(() => expect(result.current.vm.errorMessage).toContain('chưa rời CLB được'))
    expect(result.current.vm.dialog).toBe('resign')
    await waitFor(() => expect(result.current.vm.membership?.resignBlockers.map((blocker) => blocker.refId)).toContain('t-new'))
    expect(db.memberships.find((membership) => membership.id === 'm-guitar-tram')?.status).toBe('PROBATION')
  })

  it('goes back to My clubs after leaving', async () => {
    const { result } = await render('u-tram')
    act(() => result.current.vm.open('resign'))
    await waitFor(() => expect(result.current.vm.checking).toBe(false))
    act(() => result.current.vm.confirm('Chuyển trường vào học kỳ sau.'))
    await waitFor(() => expect(result.current.location.pathname).toBe('/clubs'))
    expect(db.memberships.find((membership) => membership.id === 'm-guitar-tram')?.status).toBe('LEFT')
  })
})

describe('useLeaveRequestsViewModel (FR-MEM-07, NFR-REL-03, IF-01)', () => {
  const render = async () => {
    const wrapper = await clubWrapper('u-anh')
    const hook = renderHook(() => useLeaveRequestsViewModel(), { wrapper })
    await waitFor(() => expect(hook.result.current.requests).toHaveLength(1))
    return hook
  }
  const khoa = () => db.memberships.find((membership) => membership.id === 'm-guitar-khoa')

  it('approves and rejects with a message that matches the outcome', async () => {
    const toastSuccess = vi.spyOn(toast, 'success')
    const { result } = await render()
    const [request] = result.current.requests
    if (!request) throw new Error('Thiếu yêu cầu')
    act(() => result.current.openDialog(request, 'reject'))
    act(() => result.current.reject('Ban Hậu cần đang thiếu người tuần này.'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Đã từ chối yêu cầu tạm nghỉ của Phan Anh Khoa.'))
    expect(result.current.dialog).toBeNull()
    expect(khoa()?.status).toBe('ACTIVE')
    await waitFor(() => expect(result.current.requests).toEqual([]))
  })

  it('moves the member on leave when approved', async () => {
    const toastSuccess = vi.spyOn(toast, 'success')
    const { result } = await render()
    const [request] = result.current.requests
    if (!request) throw new Error('Thiếu yêu cầu')
    act(() => result.current.openDialog(request, 'approve'))
    act(() => result.current.approve())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Phan Anh Khoa đã chuyển sang Tạm nghỉ.'))
    expect(khoa()?.status).toBe('ON_LEAVE')
  })

  it('shows the conflict banner on 409 without deciding, and clears it on reload', async () => {
    const { result } = await render()
    const [request] = result.current.requests
    if (!request) throw new Error('Thiếu yêu cầu')
    const stored = db.leaveRequests.find((leave) => leave.id === request.id)
    if (stored) stored.version += 1
    act(() => result.current.openDialog(request, 'approve'))
    act(() => result.current.approve())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.dialog).toBeNull()
    expect(khoa()?.status).toBe('ACTIVE')
    act(() => result.current.reloadAfterConflict())
    expect(result.current.conflict).toBe(false)
  })

  it('reports the reason and reloads the request when the member got a standing position meanwhile', async () => {
    const toastError = vi.spyOn(toast, 'error')
    const { result } = await render()
    const [request] = result.current.requests
    if (!request) throw new Error('Thiếu yêu cầu')
    grantPosition({ userId: 'u-khoa', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-logistics', assignedBy: 'u-anh' })
    act(() => result.current.openDialog(request, 'approve'))
    act(() => result.current.approve())
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('đang giữ chức vụ thường trực')))
    expect(result.current.dialog?.mode).toBe('approve')
    await waitFor(() => expect(result.current.requests[0]?.blockers[0]).toContain('Phó ban Hậu cần'))
    expect(khoa()?.status).toBe('ACTIVE')
  })
})
