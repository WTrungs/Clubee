import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { attendanceQueryKeys } from '@/features/attendance/viewModel/attendanceQueryKeys'
import { createTestWrapper, signInAs } from '@/testUtils'
import { cancelHint, cancelRegistrationText } from './eventDisplay'
import { eventQueryKeys } from './eventQueryKeys'
import { useRegistrationActionsViewModel } from './useRegistrationActionsViewModel'

const registrationOf = (userId: string) => {
  const found = db.registrations.find((registration) => registration.userId === userId && registration.eventId === 'e-winter' && registration.status !== 'CANCELLED')
  if (!found) throw new Error(`Thiếu đăng ký của ${userId}`)
  return found
}

afterEach(() => vi.restoreAllMocks())

describe('registration display (FR-EVT-13)', () => {
  it('states the cancel deadline, that it has passed before the start, or nothing once the event has started', () => {
    const now = Date.parse('2026-11-17T10:00:00+07:00')
    const open = (startAt: string) => ({ status: 'REGISTRATION_OPEN' as const, startAt })
    const later = '2026-11-29T19:00:00+07:00'
    expect(cancelHint({ status: 'CONFIRMED', allowedActions: ['CANCEL'], cancelDeadline: '2026-11-28T19:00:00+07:00' }, open(later), now)).toBe('Hủy được đến 28/11/2026 19:00.')
    expect(cancelHint({ status: 'CONFIRMED', allowedActions: [], cancelDeadline: '2026-11-17T09:00:00+07:00' }, open('2026-11-18T09:00:00+07:00'), now)).toBe('Đã qua hạn hủy (17/11/2026 09:00).')
    // Sự kiện đã bắt đầu: không còn gì để nhắc về hạn hủy.
    expect(cancelHint({ status: 'CONFIRMED', allowedActions: [], cancelDeadline: '2026-11-16T09:00:00+07:00' }, open('2026-11-17T09:00:00+07:00'), now)).toBeNull()
    // Sự kiện đã hủy: không nói gì về hạn, kể cả khi hạn đã qua.
    expect(cancelHint({ status: 'CONFIRMED', allowedActions: [], cancelDeadline: '2026-11-17T09:00:00+07:00' }, { status: 'CANCELLED', startAt: '2026-11-18T09:00:00+07:00' }, now)).toBeNull()
    expect(cancelHint({ status: 'CONFIRMED', allowedActions: [], cancelDeadline: '2026-11-28T19:00:00+07:00' }, { status: 'CLOSED', startAt: later }, now)).toBeNull()
  })

  it('tells seat holders someone else gets the seat, with the deadline', () => {
    expect(cancelRegistrationText('CONFIRMED', '2026-11-28T19:00:00+07:00')).toMatch(/người đầu danh sách chờ được nhận chỗ thay\. .+ Hạn hủy: 28\/11\/2026 19:00\.$/)
    expect(cancelRegistrationText('WAITLISTED', '2026-11-29T19:00:00+07:00')).toMatch(/^Bạn sẽ rời danh sách chờ/)
  })
})

describe('useRegistrationActionsViewModel (FR-EVT-13, NFR-REL-04)', () => {
  it('cancels only after confirming, then refreshes the event', async () => {
    signInAs('u-mai')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const success = vi.spyOn(toast, 'success')
    const { result } = renderHook(() => useRegistrationActionsViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.openCancel())
    expect(result.current.confirming).toBe(true)
    expect(registrationOf('u-mai').status).toBe('CONFIRMED')
    const id = registrationOf('u-mai').id
    act(() => result.current.confirmCancel(id))
    await waitFor(() => expect(result.current.confirming).toBe(false))
    expect(db.registrations.find((registration) => registration.id === id)?.status).toBe('CANCELLED')
    expect(success).toHaveBeenCalledWith('Đã hủy đăng ký.')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.detail('c-guitar', 'e-winter') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.sheets({ type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' }) })
  })

  it('closes the dialog and reloads when the server refuses after the deadline', async () => {
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (!event) throw new Error('Thiếu e-winter')
    event.startAt = toVnIso(Date.now() + 2 * 60 * 60 * 1000)
    signInAs('u-mai')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const failure = vi.spyOn(toast, 'error')
    const { result } = renderHook(() => useRegistrationActionsViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.openCancel())
    act(() => result.current.confirmCancel(registrationOf('u-mai').id))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.detail('c-guitar', 'e-winter') }))
    // Lý do máy chủ trả về phải hiện cho người dùng (IF-01).
    expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Đã qua hạn hủy đăng ký/))
    expect(result.current.confirming).toBe(false)
    expect(registrationOf('u-mai').status).toBe('CONFIRMED')
  })
})
