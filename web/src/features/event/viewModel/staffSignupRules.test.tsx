import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import { signupQuotaText, useStaffSignupViewModel } from './useStaffSignupViewModels'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

async function openSignup() {
  signInAs('u-bao')
  const event = await eventRepository.get('c-guitar', 'e-winter')
  return eventRepository.setStaffSignup('c-guitar', 'e-winter', { open: true, version: event.version })
}

describe('tự đăng ký vào tiểu ban (FR-EVT-06, BR-EVT-07)', () => {
  it('chỉ người quản lý nhân sự sự kiện mở được; version cũ thì 409; chưa mở thì thành viên nhận 422', async () => {
    signInAs('u-thao')
    expect(await fail(eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' }))).toMatchObject({ status: 422, code: 'SIGNUP_CLOSED' })
    expect(await fail(eventRepository.setStaffSignup('c-guitar', 'e-winter', { open: true, version: 1 }))).toMatchObject({ status: 403 })
    const opened = await openSignup()
    expect(opened.open).toBe(true)
    expect(await fail(eventRepository.setStaffSignup('c-guitar', 'e-winter', { open: false, version: opened.version - 1 }))).toMatchObject({ status: 409 })
    expect((await eventRepository.get('c-guitar', 'e-winter')).staffSignupOpen).toBe(true)
  })

  it('tiểu ban còn chỗ thì vào ngay; đã là nhân sự thì 409', async () => {
    await openSignup()
    signInAs('u-thao')
    const before = await eventRepository.staffSignup('c-guitar', 'e-winter')
    expect(before).toMatchObject({ open: true, canSignUp: true, mySubcommitteeName: null })
    expect(before.subcommittees.find((subcommittee) => subcommittee.id === 'sc-winter-logistics')).toMatchObject({ memberCount: 3, quota: 4, full: false })
    const joined = await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' })
    expect(joined).toMatchObject({ mySubcommitteeName: 'Hậu cần', canSignUp: false })
    expect(await fail(eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-media' }))).toMatchObject({ status: 409, code: 'ALREADY_STAFF' })
  })

  it('đủ chỉ tiêu thì cần lời nhắn, thành yêu cầu chờ; Trưởng BTC duyệt thì vào với nhãn vượt chỉ tiêu', async () => {
    await openSignup()
    signInAs('u-thao')
    await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' })
    signInAs('u-mai')
    expect(await fail(eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' }))).toMatchObject({ status: 400 })
    const pending = await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics', note: 'Mình có xe chở loa, muốn phụ hậu cần.' })
    expect(pending.myRequest).toMatchObject({ status: 'PENDING', subcommitteeName: 'Hậu cần' })
    expect(await fail(eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-media' }))).toMatchObject({ status: 409, code: 'REQUEST_PENDING' })

    signInAs('u-anh')
    expect(await fail(eventRepository.staffSignupRequests('c-guitar', 'e-winter'))).toMatchObject({ status: 403 })
    signInAs('u-bao')
    const [request] = await eventRepository.staffSignupRequests('c-guitar', 'e-winter')
    expect(request).toMatchObject({ person: { id: 'u-mai' }, memberCount: 4, quota: 4 })
    await eventRepository.approveStaffSignup('c-guitar', 'e-winter', request?.id ?? '')
    expect(await fail(eventRepository.approveStaffSignup('c-guitar', 'e-winter', request?.id ?? ''))).toMatchObject({ status: 422, code: 'REQUEST_DECIDED' })
    const logistics = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === 'sc-winter-logistics')
    expect(logistics?.members.find((member) => member.id === 'u-mai')).toMatchObject({ overQuota: true })
    expect(logistics?.members.find((member) => member.id === 'u-thao')).toMatchObject({ overQuota: false })
  })

  it('Trưởng BTC từ chối kèm lý do; người gửi thấy lý do và đăng ký lại được', async () => {
    await openSignup()
    signInAs('u-thao')
    await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' })
    signInAs('u-huy')
    await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics', note: 'Cho mình vào hậu cần với.' })
    signInAs('u-bao')
    const [request] = await eventRepository.staffSignupRequests('c-guitar', 'e-winter')
    expect(await fail(eventRepository.rejectStaffSignup('c-guitar', 'e-winter', request?.id ?? '', 'ít'))).toMatchObject({ status: 400 })
    await eventRepository.rejectStaffSignup('c-guitar', 'e-winter', request?.id ?? '', 'Hậu cần đã đủ người, bạn thử Chương trình nhé.')
    signInAs('u-huy')
    expect(await eventRepository.staffSignup('c-guitar', 'e-winter')).toMatchObject({
      canSignUp: true,
      myRequest: { status: 'REJECTED', reason: 'Hậu cần đã đủ người, bạn thử Chương trình nhé.' },
    })
  })
})

describe('view model tự đăng ký', () => {
  it('chọn tiểu ban đủ chỉ tiêu thì bắt buộc lời nhắn', async () => {
    await openSignup()
    signInAs('u-thao')
    await eventRepository.signUpStaff('c-guitar', 'e-winter', { subcommitteeId: 'sc-winter-logistics' })
    signInAs('u-mai')
    const event = await eventRepository.get('c-guitar', 'e-winter')
    const { result } = renderHook(() => useStaffSignupViewModel(event), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.visible).toBe(true))
    act(() => result.current.select('sc-winter-logistics'))
    expect(result.current.needsNote).toBe(true)
    act(() => result.current.submit())
    expect(result.current.noteError).toBe('Nhập lời nhắn ít nhất 5 ký tự.')
    act(() => result.current.select('sc-winter-program'))
    expect(result.current.needsNote).toBe(false)
  })

  it('signupQuotaText theo chỉ tiêu', () => {
    expect(signupQuotaText({ quota: null, memberCount: 2, full: false })).toBe('2 người, không đặt chỉ tiêu')
    expect(signupQuotaText({ quota: 4, memberCount: 3, full: false })).toBe('3/4 người')
    expect(signupQuotaText({ quota: 4, memberCount: 4, full: true })).toBe('Đủ chỉ tiêu 4/4')
  })
})
