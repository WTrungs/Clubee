import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { sessionRepository } from '../model/sessionRepository'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { seatsLeft, sessionCancelHint, sessionCancelRegistrationText } from './sessionDisplay'
import { useSessionEditViewModel } from './useSessionEditViewModel'
import { useSessionRegistrationsViewModel } from './useSessionRegistrationsViewModel'
import { useSessionRegistrationViewModel } from './useSessionRegistrationViewModel'

const PLAN = { type: 'SESSION' as const, clubId: 'c-guitar', id: 's-media-plan' }
const planSession = () => {
  const found = db.sessions.find((session) => session.id === 's-media-plan')
  if (!found) throw new Error('Thiếu s-media-plan')
  return found
}
const registrationOf = (userId: string) => db.sessionRegistrations.find((registration) => registration.userId === userId && registration.sessionId === 's-media-plan' && registration.status !== 'CANCELLED')

afterEach(() => vi.restoreAllMocks())

describe('seat display (FR-ATT-03)', () => {
  it('counts free seats and never goes below zero', () => {
    expect(seatsLeft({ capacity: 5, taken: 3, waitlist: 0 })).toEqual({ remaining: 2, full: false })
    expect(seatsLeft({ capacity: 2, taken: 2, waitlist: 4 })).toEqual({ remaining: 0, full: true })
    expect(seatsLeft({ capacity: 2, taken: 3, waitlist: 0 })).toEqual({ remaining: 0, full: true })
  })

  it('states the cancel deadline, that it has passed, or nothing once the session started or was cancelled', () => {
    const now = Date.parse('2026-11-20T10:00:00+07:00')
    const session = { startAt: '2026-11-23T18:30:00+07:00', cancelled: false }
    expect(sessionCancelHint({ allowedActions: ['CANCEL'], cancelDeadline: '2026-11-22T18:30:00+07:00' }, session, now)).toBe('Hủy được đến 22/11/2026 18:30.')
    expect(sessionCancelHint({ allowedActions: [], cancelDeadline: '2026-11-20T09:00:00+07:00' }, { ...session, startAt: '2026-11-21T09:00:00+07:00' }, now)).toBe(
      'Đã qua hạn hủy (20/11/2026 09:00). Báo người phụ trách buổi nếu bạn không đến được.',
    )
    expect(sessionCancelHint({ allowedActions: [], cancelDeadline: '2026-11-19T09:00:00+07:00' }, { ...session, startAt: '2026-11-20T09:00:00+07:00' }, now)).toBeNull()
    expect(sessionCancelHint({ allowedActions: [], cancelDeadline: '2026-11-22T18:30:00+07:00' }, { ...session, cancelled: true }, now)).toBeNull()
  })

  it('tells a seat holder someone else gets the seat, and a waiting person they leave the queue', () => {
    expect(sessionCancelRegistrationText({ status: 'CONFIRMED', cancelDeadline: '2026-11-22T18:30:00+07:00' })).toMatch(/người đầu danh sách chờ được nhận chỗ thay\. .+ Hạn hủy: 22\/11\/2026 18:30\.$/)
    expect(sessionCancelRegistrationText({ status: 'WAITLISTED', cancelDeadline: '2026-11-23T18:30:00+07:00' })).toMatch(/^Bạn sẽ rời danh sách chờ/)
  })
})

describe('useSessionRegistrationViewModel (FR-ATT-03, NFR-REL-04)', () => {
  it('joins the waitlist of a full session, says the position and refreshes the registrations and the attendance sheet', async () => {
    signInAs('u-ha')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const success = vi.spyOn(toast, 'success')
    const { result } = renderHook(() => useSessionRegistrationViewModel('c-guitar', 's-media-plan'), { wrapper })
    act(() => result.current.register())
    await waitFor(() => expect(success).toHaveBeenCalledWith('Đã vào danh sách chờ, vị trí 1.'))
    expect(queryClient.getQueryData<{ myRegistration: { status: string } }>(attendanceQueryKeys.session('c-guitar', 's-media-plan'))?.myRegistration.status).toBe('WAITLISTED')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.registrationsOf('c-guitar', 's-media-plan') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.sheets(PLAN) })
  })

  it('cancels only after confirming and closes the dialog once saved', async () => {
    signInAs('u-vy')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useSessionRegistrationViewModel('c-guitar', 's-media-plan'), { wrapper })
    act(() => result.current.openCancel())
    expect(result.current.confirming).toBe(true)
    act(() => result.current.confirmCancel(registrationOf('u-vy')?.id ?? ''))
    await waitFor(() => expect(result.current.confirming).toBe(false))
    expect(registrationOf('u-vy')).toBeUndefined()
  })

  it('shows the server reason and reloads the session when cancelling is refused', async () => {
    planSession().startAt = toVnIso(Date.now() + 2 * 60 * 60 * 1000)
    signInAs('u-vy')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const failure = vi.spyOn(toast, 'error')
    const { result } = renderHook(() => useSessionRegistrationViewModel('c-guitar', 's-media-plan'), { wrapper })
    act(() => result.current.openCancel())
    act(() => result.current.confirmCancel(registrationOf('u-vy')?.id ?? ''))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.session('c-guitar', 's-media-plan') }))
    expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Đã qua hạn hủy đăng ký/))
    expect(result.current.confirming).toBe(false)
    expect(registrationOf('u-vy')?.status).toBe('CONFIRMED')
  })
})

describe('useSessionRegistrationsViewModel', () => {
  it('lists seat holders then the waitlist for the person running the session', async () => {
    signInAs('u-ha')
    await sessionRepository.register('c-guitar', 's-media-plan')
    signInAs('u-linh')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useSessionRegistrationsViewModel('c-guitar', 's-media-plan'), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    expect(result.current.rows.map((row) => [row.attendee.id, row.status])).toEqual([
      ['u-vy', 'CONFIRMED'],
      ['u-linh', 'CONFIRMED'],
      ['u-ha', 'WAITLISTED'],
    ])
    expect(result.current.totalElements).toBe(3)
  })
})

describe('editing seats from the session sheet (FR-ATT-03)', () => {
  it('refreshes the registrations and the attendance sheet, since more seats can promote people waiting', async () => {
    signInAs('u-ha')
    await sessionRepository.register('c-guitar', 's-media-plan')
    signInAs('u-linh')
    const session = await sessionRepository.get('c-guitar', 's-media-plan')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSessionEditViewModel('c-guitar', session, () => undefined), { wrapper })
    act(() => result.current.form.setValue('capacity', '3'))
    await act(() => result.current.submit())
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.sheets(PLAN) }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceQueryKeys.registrationsOf('c-guitar', 's-media-plan') })
    expect(registrationOf('u-ha')?.status).toBe('CONFIRMED')
  })
})
