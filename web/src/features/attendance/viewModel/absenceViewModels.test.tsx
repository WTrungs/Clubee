import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { SessionDetail } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { absenceTabLabel } from './sessionDisplay'
import { useAbsenceRequestsViewModel, useAbsenceViewModel } from './useAbsenceViewModel'

const REHEARSAL = 's-music-rehearsal'
const SHEET = { type: 'SESSION' as const, clubId: 'c-guitar', id: REHEARSAL }

afterEach(() => vi.restoreAllMocks())

describe('absence display', () => {
  it('counts pending requests on the tab label only when there are some', () => {
    expect(absenceTabLabel(2)).toBe('Xin phép (2)')
    expect(absenceTabLabel(0)).toBe('Xin phép')
    expect(absenceTabLabel(null)).toBe('Xin phép')
  })
})

describe('useAbsenceViewModel (FR-ATT-04)', () => {
  it('sends a request, closes the dialog and puts the new request in the cached session', async () => {
    signInAs('u-bao')
    const { wrapper, queryClient } = createTestWrapper()
    const success = vi.spyOn(toast, 'success')
    const { result } = renderHook(() => useAbsenceViewModel('c-guitar', REHEARSAL), { wrapper })
    act(() => result.current.setRequestOpen(true))
    act(() => result.current.submitRequest('Trùng lịch thực tập ở công ty.'))
    await waitFor(() => expect(result.current.requestOpen).toBe(false))
    expect(success).toHaveBeenCalledWith('Đã gửi đơn xin phép. Bạn sẽ được báo khi có kết quả.')
    expect(queryClient.getQueryData<SessionDetail>(attendanceQueryKeys.session('c-guitar', REHEARSAL))?.myAbsenceRequest?.status).toBe('PENDING')
  })

  it('shows the server reason and reloads the session when the session already started', async () => {
    const session = db.sessions.find((candidate) => candidate.id === REHEARSAL)
    if (session) session.startAt = toVnIso(Date.now() - 60_000)
    signInAs('u-bao')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const failure = vi.spyOn(toast, 'error')
    const { result } = renderHook(() => useAbsenceViewModel('c-guitar', REHEARSAL), { wrapper })
    act(() => result.current.setRequestOpen(true))
    act(() => result.current.submitRequest('Trùng lịch thực tập ở công ty.'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.session('c-guitar', REHEARSAL) }))
    expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Buổi đã bắt đầu/))
    expect(result.current.requestOpen).toBe(false)
  })

  it('withdraws with the version the sender saw', async () => {
    signInAs('u-nam')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useAbsenceViewModel('c-guitar', REHEARSAL), { wrapper })
    act(() => result.current.setWithdrawOpen(true))
    act(() => result.current.confirmWithdraw('ab-rehearsal-nam', 1))
    await waitFor(() => expect(result.current.withdrawOpen).toBe(false))
    expect(db.absenceRequests.find((request) => request.id === 'ab-rehearsal-nam')?.status).toBe('WITHDRAWN')
  })
})

describe('useAbsenceRequestsViewModel (FR-ATT-04)', () => {
  it('approves a pending request and refreshes the list, the tab count and the attendance sheet', async () => {
    signInAs('u-anh')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAbsenceRequestsViewModel('c-guitar', REHEARSAL), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    const [row] = result.current.rows
    if (!row) throw new Error('Thiếu đơn')
    act(() => result.current.approve(row))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.sheets(SHEET) }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.session('c-guitar', REHEARSAL) })
    await waitFor(() => expect(result.current.rows[0]?.status).toBe('APPROVED'))
  })

  it('rejects with a reason through the dialog, and reloads when someone else already decided', async () => {
    signInAs('u-anh')
    const { wrapper } = createTestWrapper()
    const failure = vi.spyOn(toast, 'error')
    const { result } = renderHook(() => useAbsenceRequestsViewModel('c-guitar', REHEARSAL), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    const [row] = result.current.rows
    if (!row) throw new Error('Thiếu đơn')
    // Người khác vừa duyệt đơn này.
    const stored = db.absenceRequests.find((request) => request.id === row.id)
    if (stored) Object.assign(stored, { status: 'APPROVED', version: stored.version + 1 })
    act(() => result.current.openReject(row))
    expect(result.current.rejecting?.id).toBe(row.id)
    act(() => result.current.confirmReject('Buổi này chạy thử toàn bộ tiết mục.'))
    await waitFor(() => expect(result.current.rejecting).toBeNull())
    expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Đơn vừa được rút hoặc được người khác xử lý/))
    await waitFor(() => expect(result.current.rows[0]?.status).toBe('APPROVED'))
  })
})
