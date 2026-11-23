import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnToday } from '@/api/mocks/mockTime'
import { maskContact, parseGuestContact } from '@/shared/lib/guestRules'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import { publicEventRepository } from '../model/publicEventRepository'
import { guestPassStatusText, useGuestRegistrationViewModel } from './useGuestViewModels'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const register = (fullName: string, contact: { email?: string; phone?: string }) => publicEventRepository.registerGuest('e-winter', { fullName, ...contact })

describe('khách mời đăng ký (FR-EVT-12, BR-EVT-02..04)', () => {
  it('dùng chung số chỗ với thành viên (còn 1 chỗ): người đầu Nhận chỗ, người sau vào danh sách chờ; có thư mã tham dự', async () => {
    const first = await register('Phạm An', { email: 'an.pham@khach.test' })
    const second = await register('Lý Bình', { phone: '0912 345 678' })
    const third = await register('Đỗ Chi', { email: 'chi.do@khach.test' })
    expect([first.status, second.status, third.status]).toEqual(['CONFIRMED', 'WAITLISTED', 'WAITLISTED'])
    expect([second.waitlistPosition, third.waitlistPosition]).toEqual([1, 2])
    expect(first).toMatchObject({ emailHint: 'an***@khach.test', allowedActions: ['CANCEL'], event: { id: 'e-winter', seatsLeft: 0 } })
    expect(first.code).toMatch(/^[A-Z2-9]{8}$/)
    expect(db.guestMails.at(-1)).toMatchObject({ to: 'chi.do@khach.test', subject: 'Mã tham dự Đêm nhạc Mùa đông' })
    expect(db.guestMails.some((mail) => mail.body.includes(second.code))).toBe(false)
  })

  it('trùng email hoặc SĐT thì 409; thiếu cả hai thì 400; sự kiện không mở cho khách 404; quá hạn 422', async () => {
    await register('Phạm An', { email: 'an.pham@khach.test', phone: '0912345678' })
    expect(await fail(register('Người khác', { email: 'AN.PHAM@khach.test' }))).toMatchObject({ status: 409, code: 'ALREADY_REGISTERED' })
    expect(await fail(register('Người khác', { phone: '0912.345.678' }))).toMatchObject({ status: 409 })
    expect(await fail(register('Người khác', {}))).toMatchObject({ status: 400 })
    expect(await fail(publicEventRepository.registerGuest('e-workshop', { fullName: 'Khách', email: 'k@khach.test' }))).toMatchObject({ status: 404 })
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) winter.registrationDeadline = '2020-01-01T00:00:00+07:00'
    expect(await fail(register('Khách muộn', { email: 'muon@khach.test' }))).toMatchObject({ status: 422, code: 'REGISTRATION_CLOSED' })
  })

  it('khách tự hủy qua vé thì người đầu danh sách chờ được nhận chỗ và nhận thư', async () => {
    const first = await register('Phạm An', { email: 'an.pham@khach.test' })
    const waiting = await register('Lý Bình', { email: 'binh.ly@khach.test' })
    const later = await register('Đỗ Chi', { email: 'chi.do@khach.test' })
    const cancelled = await publicEventRepository.cancelPass(first.code)
    expect(cancelled).toMatchObject({ status: 'CANCELLED', allowedActions: [] })
    expect(await publicEventRepository.pass(waiting.code)).toMatchObject({ status: 'CONFIRMED' })
    expect(await publicEventRepository.pass(later.code)).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 })
    expect(db.guestMails.at(-1)).toMatchObject({ to: 'binh.ly@khach.test', subject: 'Bạn đã được nhận chỗ: Đêm nhạc Mùa đông' })
    expect(await fail(publicEventRepository.cancelPass(first.code))).toMatchObject({ status: 422 })
    expect(await fail(publicEventRepository.pass('KHONGCO1'))).toMatchObject({ status: 404 })
  })

  it('BTC tra khách theo mã, email, SĐT và ghi có mặt một lần mỗi ngày; người ngoài BTC không ghi được', async () => {
    signInAs('u-kiet')
    expect(await eventRepository.guestRegistrations('c-guitar', 'e-livestream', { q: 'khach7q2' })).toHaveLength(1)
    expect(await eventRepository.guestRegistrations('c-guitar', 'e-livestream', { q: 'chau.pham@khach.test' })).toHaveLength(1)
    expect(await eventRepository.guestRegistrations('c-guitar', 'e-livestream', { q: 'chau' })).toHaveLength(1)
    expect(await eventRepository.guestRegistrations('c-guitar', 'e-livestream', { q: '0901' })).toHaveLength(0)
    const [row] = await eventRepository.guestRegistrations('c-guitar', 'e-livestream', {})
    expect(row).toMatchObject({ code: 'KHACH7Q2', emailHint: 'ch***@khach.test', phoneHint: '090****567', checkedIn: false })
    const saved = await eventRepository.checkInGuest('c-guitar', 'e-livestream', row?.id ?? '', vnToday())
    expect(saved.checkedIn).toBe(true)
    expect(await fail(eventRepository.checkInGuest('c-guitar', 'e-livestream', row?.id ?? '', vnToday()))).toMatchObject({ status: 422, code: 'ALREADY_CHECKED_IN' })
    expect((await eventRepository.report('c-guitar', 'e-livestream')).registrations).toMatchObject({ guests: 1, guestsCheckedIn: 1 })

    signInAs('u-thao')
    expect(await fail(eventRepository.checkInGuest('c-guitar', 'e-livestream', row?.id ?? '', vnToday()))).toMatchObject({ status: 403 })
  })

  it('danh sách đăng ký của BTC đánh dấu khách mời', async () => {
    signInAs('u-kiet')
    const page = await eventRepository.registrations('c-guitar', 'e-livestream', {})
    expect(page.content.find((row) => row.guest)).toMatchObject({ attendee: { fullName: 'Phạm Minh Châu' } })
  })
})

describe('quy tắc và view model khách mời', () => {
  it('parseGuestContact chuẩn hóa email, SĐT và báo thiếu liên hệ', () => {
    expect(parseGuestContact({ fullName: '  Phạm   An ', email: ' AN@Khach.Test ', phone: '' })).toMatchObject({ fullName: 'Phạm An', email: 'an@khach.test', phone: null, errors: [] })
    expect(parseGuestContact({ fullName: 'A', email: '', phone: '' }).errors.map((error) => error.field)).toEqual(['fullName', 'email'])
    expect(maskContact('0901234567')).toBe('090****567')
    expect(guestPassStatusText({ status: 'WAITLISTED', waitlistPosition: 2 })).toBe('Danh sách chờ, vị trí 2')
  })

  it('đăng ký xong hiện vé và thư ở hộp thư demo', async () => {
    const { result } = renderHook(() => useGuestRegistrationViewModel('e-winter'), { wrapper: createTestWrapper().wrapper })
    act(() => {
      result.current.form.setValue('fullName', 'Phạm An')
      result.current.form.setValue('email', 'an.pham@khach.test')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.pass?.status).toBe('CONFIRMED'))
    expect(result.current.demoMail?.subject).toBe('Mã tham dự Đêm nhạc Mùa đông')
  })
})
