import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { API } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { formatDate, formatTime } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import { cancelHint, reconfirmHint, registrationStatusDisplay, rescheduleImpact, scheduleChangeText } from './eventDisplay'
import { eventQueryKeys } from './eventQueryKeys'
import { rescheduleDefaults, rescheduleSchema, sameSchedule, toRescheduleRequest, type RescheduleValues } from './rescheduleSchema'
import { useRegistrationActionsViewModel } from './useRegistrationActionsViewModel'
import { useRescheduleViewModel } from './useRescheduleViewModel'

const DAY_MS = 24 * 60 * 60 * 1000
const winter = () => {
  const event = db.events.find((candidate) => candidate.id === 'e-winter')
  if (!event) throw new Error('Thiếu e-winter')
  return event
}
const at = (days: number) => new Date(Date.now() + days * DAY_MS)
const values = (changes: Partial<RescheduleValues> = {}): RescheduleValues => ({
  startDate: formatDate(at(14)),
  startTime: '19:00',
  endDate: formatDate(at(14)),
  endTime: '22:00',
  deadlineDate: '',
  deadlineTime: '',
  reason: 'Hội trường bận sửa chữa.',
  ...changes,
})
const fieldsOf = (input: RescheduleValues) => {
  const parsed = rescheduleSchema.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))
}

afterEach(() => vi.restoreAllMocks())

describe('rescheduleSchema (FR-EVT-14)', () => {
  it('accepts a later time and checks each field', () => {
    expect(fieldsOf(values())).toEqual([])
    expect(fieldsOf(values({ startDate: formatDate(at(-1)), endDate: formatDate(at(-1)) }))).toEqual(['startDate'])
    expect(fieldsOf(values({ endTime: '18:00' }))).toEqual(['endDate'])
    expect(fieldsOf(values({ startDate: '31/02/2027' }))).toEqual(['startDate'])
    // Giờ sai dạng chỉ báo ở ô giờ, không kèm câu ngày không tồn tại ở ô ngày.
    expect(fieldsOf(values({ startTime: '25:00' }))).toEqual(['startTime'])
    expect(fieldsOf(values({ deadlineDate: formatDate(at(13)) }))).toEqual(['deadlineDate'])
    expect(fieldsOf(values({ deadlineDate: formatDate(at(15)), deadlineTime: '12:00' }))).toEqual(['deadlineDate'])
    expect(fieldsOf(values({ reason: 'gấp' }))).toEqual(['reason'])
  })

  it('fills in the current time and always sends the deadline, null when cleared', () => {
    const event = { startAt: '2026-11-29T19:00:00+07:00', endAt: '2026-11-29T22:00:00+07:00', registrationDeadline: '2026-11-27T23:59:00+07:00' }
    expect(rescheduleDefaults(event)).toMatchObject({ startDate: '29/11/2026', startTime: '19:00', endTime: '22:00', deadlineDate: '27/11/2026', deadlineTime: '23:59', reason: '' })
    expect(rescheduleDefaults({ ...event, registrationDeadline: null })).toMatchObject({ deadlineDate: '', deadlineTime: '' })
    const request = toRescheduleRequest(values({ reason: '  Đổi phòng.  ' }))
    expect(request).toMatchObject({ registrationDeadline: null, reason: 'Đổi phòng.' })
    expect(sameSchedule(event, { startAt: '2026-11-29T12:00:00Z', endAt: '2026-11-29T15:00:00Z' })).toBe(true)
    expect(sameSchedule(event, { startAt: '2026-11-29T12:30:00Z', endAt: '2026-11-29T15:00:00Z' })).toBe(false)
  })
})

describe('reschedule display', () => {
  it('tells the person who reschedules who must confirm again', () => {
    const event = (changes: Partial<Parameters<typeof rescheduleImpact>[0]>) => ({ status: 'REGISTRATION_OPEN' as const, confirmedCount: 12, waitlistCount: 2, myRegistration: null, ...changes })
    const own = { id: 'r-1', status: 'CONFIRMED' as const, waitlistPosition: null, registeredAt: '', promotedAt: null, cancelDeadline: '', reconfirmDeadline: null, allowedActions: [] }
    expect(rescheduleImpact(event({ status: 'APPROVED', confirmedCount: 0, waitlistCount: 0 }))).toBe('Sự kiện chưa mở đăng ký nên chỉ đổi giờ. BTC nhận thông báo kèm lý do.')
    expect(rescheduleImpact(event({}))).toMatch(/^12 người đang giữ chỗ sẽ chuyển sang Chờ xác nhận lại\..+ 2 người ở danh sách chờ giữ nguyên thứ tự\.$/)
    expect(rescheduleImpact(event({ myRegistration: own }))).toMatch(/^11 người đang giữ chỗ .+ Đăng ký của bạn giữ nguyên Nhận chỗ\. 2 người/)
    expect(rescheduleImpact(event({ confirmedCount: 0, waitlistCount: 0 }))).toBe('Không ai khác đang giữ chỗ nên không ai phải xác nhận lại.')
    expect(registrationStatusDisplay.RECONFIRM_PENDING).toEqual({ label: 'Chờ xác nhận lại', tone: 'info' })
  })

  it('reminds a registrant to confirm, and drops the separate cancel hint', () => {
    const pending = { status: 'RECONFIRM_PENDING' as const, reconfirmDeadline: '2026-11-19T10:00:00+07:00', cancelDeadline: '2026-11-19T10:00:00+07:00', allowedActions: ['RECONFIRM' as const, 'CANCEL' as const] }
    expect(reconfirmHint(pending)).toBe('Sự kiện đã dời giờ. Xác nhận tham dự trước 19/11/2026 10:00 để giữ chỗ, quá hạn thì đăng ký bị hủy.')
    expect(reconfirmHint({ ...pending, allowedActions: [] })).toBeNull()
    expect(cancelHint(pending, { status: 'REGISTRATION_OPEN', startAt: '2026-11-29T19:00:00+07:00' }, Date.parse('2026-11-17T10:00:00+07:00'))).toBeNull()
    expect(scheduleChangeText({ fromStartAt: '2026-11-29T19:00:00+07:00', fromEndAt: '2026-11-29T22:00:00+07:00', toStartAt: '2026-12-01T18:00:00+07:00', toEndAt: '2026-12-01T21:00:00+07:00' })).toBe(
      'Đã dời từ 19:00 – 22:00, 29/11/2026 sang 18:00 – 21:00, 01/12/2026.',
    )
  })
})

const openSheetAs = async (userId: string) => {
  signInAs(userId)
  const event = await eventRepository.get('c-guitar', 'e-winter')
  const { wrapper, queryClient } = createTestWrapper()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const rendered = renderHook(() => useRescheduleViewModel('c-guitar', event), { wrapper })
  act(() => rendered.result.current.openSheet())
  return { ...rendered, queryClient, invalidate }
}
const fill = (form: ReturnType<typeof useRescheduleViewModel>['form'], input: RescheduleValues) => {
  for (const [key, value] of Object.entries(input)) form.setValue(key as keyof RescheduleValues, value)
}
const submit = async (result: { current: ReturnType<typeof useRescheduleViewModel> }) => {
  await act(async () => {
    await result.current.submit()
  })
}

describe('useRescheduleViewModel (FR-EVT-14, NFR-REL-03, 04)', () => {
  it('saves, stores the server copy and says how many people must confirm', async () => {
    const success = vi.spyOn(toast, 'success')
    const { result, queryClient } = await openSheetAs('u-bao')
    expect(result.current.form.getValues('startTime')).toBe(formatTime(winter().startAt))
    fill(result.current.form, values())
    await submit(result)
    await waitFor(() => expect(result.current.open).toBe(false))
    expect(success).toHaveBeenCalledWith('Đã dời thời gian. 11 người giữ chỗ cần xác nhận lại.')
    expect(queryClient.getQueryData<{ lastScheduleChange: unknown }>(eventQueryKeys.detail('c-guitar', 'e-winter'))?.lastScheduleChange).toMatchObject({ reason: 'Hội trường bận sửa chữa.' })
  })

  it('does not send a time that did not change', async () => {
    const { result } = await openSheetAs('u-bao')
    result.current.form.setValue('reason', 'Không đổi gì cả.')
    await submit(result)
    expect(result.current.form.getFieldState('startDate').error?.message).toBe('Thời gian mới trùng thời gian hiện tại.')
    expect(winter().scheduleChanges).toHaveLength(0)
  })

  it('closes and reloads on a version conflict instead of overwriting', async () => {
    const failure = vi.spyOn(toast, 'error')
    const { result, invalidate } = await openSheetAs('u-bao')
    winter().version += 1
    fill(result.current.form, values())
    await submit(result)
    await waitFor(() => expect(result.current.open).toBe(false))
    expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Sự kiện vừa được người khác cập nhật/))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.detail('c-guitar', 'e-winter') })
    expect(winter().scheduleChanges).toHaveLength(0)
  })

  it('shows the reason for a refusal and reloads the buttons (IF-01)', async () => {
    const { result, invalidate } = await openSheetAs('u-bao')
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'EVENT_LEAD', permission: 'RUN_EVENT', enabled: false, updatedBy: 'u-anh', updatedAt: '2026-11-16T10:00:00+07:00' })
    fill(result.current.form, values())
    await submit(result)
    await waitFor(() => expect(result.current.errorMessage).toMatch(/dời thời gian sự kiện/))
    expect(result.current.open).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.detail('c-guitar', 'e-winter') })
  })

  it('puts server field errors on the matching inputs', async () => {
    server.use(
      http.post(`${API}/clubs/:clubId/events/:eventId/reschedule`, () =>
        HttpResponse.json({ status: 400, code: 'VALIDATION', errors: [{ field: 'registrationDeadline', message: 'Hạn đăng ký không được sau giờ bắt đầu mới.' }] }, { status: 400 }),
      ),
    )
    const { result } = await openSheetAs('u-bao')
    fill(result.current.form, values())
    await submit(result)
    await waitFor(() => expect(result.current.form.getFieldState('deadlineDate').error?.message).toBe('Hạn đăng ký không được sau giờ bắt đầu mới.'))
    expect(result.current.errorMessage).toBeNull()
  })
})

describe('reconfirming from the registration panel (FR-EVT-14)', () => {
  it('confirms once the server saves it', async () => {
    signInAs('u-bao')
    await eventRepository.reschedule('c-guitar', 'e-winter', { startAt: at(14).toISOString(), endAt: at(14.1).toISOString(), reason: 'Hội trường bận sửa chữa.', version: winter().version })
    signInAs('u-mai')
    const mine = (await eventRepository.get('c-guitar', 'e-winter')).myRegistration
    const success = vi.spyOn(toast, 'success')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useRegistrationActionsViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.reconfirm(mine?.id ?? ''))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Đã xác nhận tham dự theo giờ mới.'))
    expect(db.registrations.find((registration) => registration.id === mine?.id)?.status).toBe('CONFIRMED')
  })

  it('states the reason and reloads when the confirmation is too late (IF-01)', async () => {
    signInAs('u-bao')
    await eventRepository.reschedule('c-guitar', 'e-winter', { startAt: at(14).toISOString(), endAt: at(14.1).toISOString(), reason: 'Hội trường bận sửa chữa.', version: winter().version })
    const stored = db.registrations.find((registration) => registration.userId === 'u-mai' && registration.eventId === 'e-winter' && registration.status === 'RECONFIRM_PENDING')
    if (!stored) throw new Error('Thiếu đăng ký của u-mai')
    // Máy chủ đã hủy vì quá hạn trong lúc trang còn hiện nút cũ.
    Object.assign(stored, { status: 'CANCELLED', cancelKind: 'EXPIRED', cancelledAt: new Date().toISOString() })
    signInAs('u-mai')
    const failure = vi.spyOn(toast, 'error')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRegistrationActionsViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.reconfirm(stored.id))
    await waitFor(() => expect(failure).toHaveBeenCalledWith(expect.stringMatching(/^Đã quá hạn xác nhận \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\) nên đăng ký đã bị hủy\.$/)))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.detail('c-guitar', 'e-winter') })
  })
})
