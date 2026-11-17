import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/apiError'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { createTestWrapper, signInAs } from '@/testUtils'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef, AttendanceCode } from '../model/attendanceTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { codeRefetchInterval, localExpiry, useAttendanceQrViewModel } from './useAttendanceQrViewModel'

const weekly: AttendanceActivityRef = { type: 'SESSION', clubId: 'c-guitar', id: 's-weekly-now' }

function renderQr() {
  signInAs('u-anh')
  const { wrapper, queryClient } = createTestWrapper()
  const rendered = renderHook(() => useAttendanceQrViewModel(weekly, null), { wrapper })
  return { ...rendered, queryClient }
}

describe('useAttendanceQrViewModel', () => {
  it('shows the current code with the seconds left in its cycle', async () => {
    const { result } = renderQr()
    await waitFor(() => expect(result.current.code).not.toBeNull())
    expect(result.current.secondsLeft).toBeGreaterThan(0)
    expect(result.current.secondsLeft).toBeLessThanOrEqual(30)
    expect(result.current.remainingRatio).toBeGreaterThan(0)
    expect(result.current.blockedReason).toBeNull()
  })

  it('shows the server reason instead of the code once someone closed attendance', async () => {
    const { result, queryClient } = renderQr()
    await waitFor(() => expect(result.current.code).not.toBeNull())
    const sheet = await attendanceRepository.sheet(weekly, {})
    await attendanceRepository.close(weekly, { action: 'CLOSE', day: null, version: sheet.version })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.blockedReason).toBe('Điểm danh đã chốt nên danh sách chỉ xem được.'))
    expect(result.current.code).toBeNull()
    expect(result.current.loadError).toBeNull()
    // Danh sách phía sau cũng được làm mới để hiện trạng thái đã chốt.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.sheets(weekly) })
    const state = queryClient.getQueryState<AttendanceCode>(attendanceQueryKeys.code(weekly, null))
    expect(state && codeRefetchInterval(state)).toBe(false)
  })

  it('offers a retry when the server is unavailable', async () => {
    server.use(http.get('*/api/v1/clubs/:clubId/sessions/:sessionId/attendance/code', () => problem(503, 'Máy chủ đang bận.', 'UNAVAILABLE')))
    const { result } = renderQr()
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    expect(result.current.blockedReason).toBeNull()
    expect(result.current.code).toBeNull()
  })
})

describe('QR code timing', () => {
  const code = { day: null, payload: 'x', expiresAt: '2026-11-10T18:00:30+07:00', refreshSeconds: 30 }
  const at = (time: string) => Date.parse(`2026-11-10T${time}+07:00`)

  it('waits until the code expires, at least one second', () => {
    const received = { error: null, data: code, dataUpdatedAt: at('18:00:05') }
    expect(codeRefetchInterval(received, at('18:00:10'))).toBe(20_000)
    expect(codeRefetchInterval(received, at('18:00:40'))).toBe(1000)
  })

  it('assumes one full cycle from receipt when this clock is far off the server clock', () => {
    // Máy này chậm 2 phút: mã có vẻ còn 150 giây.
    expect(localExpiry(code, at('17:58:00'))).toBe(at('17:58:30'))
    // Máy này nhanh 1 phút: mã có vẻ đã hết hạn.
    expect(localExpiry(code, at('18:01:10'))).toBe(at('18:01:40'))
    expect(localExpiry(code, at('18:00:10'))).toBe(at('18:00:30'))
  })

  it('stops on a rule error, retries slowly on a server error, and waits for the first code', () => {
    expect(codeRefetchInterval({ error: new ApiError(422, { code: 'ATTENDANCE_CLOSED' }), data: code, dataUpdatedAt: 0 })).toBe(false)
    expect(codeRefetchInterval({ error: new ApiError(503), data: code, dataUpdatedAt: 0 })).toBe(10_000)
    expect(codeRefetchInterval({ error: null, data: undefined, dataUpdatedAt: 0 })).toBe(false)
  })
})
