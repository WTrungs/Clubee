import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { latestResetLinkFor } from '@/api/mocks/mockPasswordResets'
import { getSessionUserId } from '@/api/mocks/mockSession'
import { createTestWrapper, signInAs } from '@/testUtils'
import { accountRepository } from '../model/accountRepository'
import { resetPageState, useResetPasswordViewModel } from './useResetPasswordViewModel'
import { useForgotPasswordViewModel } from './useForgotPasswordViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const tokenOf = (path: string | null) => new URLSearchParams(path?.split('?')[1] ?? '').get('token') ?? ''
const user = (id: string) => {
  const found = db.users.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Thiếu ${id}`)
  return found
}
/** Gửi yêu cầu rồi lấy token của thư vừa gửi trong hộp thư demo. */
async function requestLink(email: string): Promise<string> {
  await accountRepository.requestPasswordReset(email)
  return tokenOf(latestResetLinkFor(email))
}

afterEach(() => vi.useRealTimers())

describe('liên kết đặt lại mật khẩu (FR-ACC-03)', () => {
  it('chỉ tạo liên kết cho tài khoản Hoạt động, và luôn trả 202', async () => {
    await expect(accountRepository.requestPasswordReset('khong.ai@demo.test')).resolves.toBeUndefined()
    await expect(accountRepository.requestPasswordReset('khanh.vuong@demo.test')).resolves.toBeUndefined()
    await expect(accountRepository.requestPasswordReset('lan.to@demo.test')).resolves.toBeUndefined()
    expect(db.passwordResets).toHaveLength(0)

    const token = await requestLink(' Ha.Le@demo.test ')
    expect(token).not.toBe('')
    expect(await accountRepository.getPasswordResetLink(token)).toMatchObject({ status: 'VALID', emailHint: 'ha***@demo.test' })
  })

  it('đặt mật khẩu mới, đăng xuất phiên cũ của chính tài khoản đó; liên kết chỉ dùng một lần', async () => {
    signInAs('u-ha')
    const token = await requestLink('ha.le@demo.test')
    await accountRepository.completePasswordReset(token, { newPassword: 'mat-khau-moi-1' })

    expect(user('u-ha').password).toBe('mat-khau-moi-1')
    expect(getSessionUserId()).toBeNull()
    expect((await accountRepository.getPasswordResetLink(token)).status).toBe('USED')
    expect(await fail(accountRepository.completePasswordReset(token, { newPassword: 'mat-khau-moi-2' }))).toMatchObject({ status: 422, code: 'RESET_LINK_USED' })
    expect(await fail(accountRepository.login({ email: 'ha.le@demo.test', password: 'mot-chuoi-bat-ky' }))).toMatchObject({ status: 401 })
    await expect(accountRepository.login({ email: 'ha.le@demo.test', password: 'mat-khau-moi-1' })).resolves.toMatchObject({ id: 'u-ha' })
  })

  it('giữ phiên của người khác khi đặt lại mật khẩu cho tài khoản khác', async () => {
    signInAs('u-anh')
    const token = await requestLink('ha.le@demo.test')
    await accountRepository.completePasswordReset(token, { newPassword: 'mat-khau-moi-1' })
    expect(getSessionUserId()).toBe('u-anh')
  })

  it('liên kết mới làm liên kết cũ mất hiệu lực', async () => {
    const first = await requestLink('ha.le@demo.test')
    const second = await requestLink('ha.le@demo.test')
    expect(second).not.toBe(first)
    expect((await accountRepository.getPasswordResetLink(first)).status).toBe('USED')
    expect((await accountRepository.getPasswordResetLink(second)).status).toBe('VALID')
  })

  it('hết hạn sau 30 phút', async () => {
    const token = await requestLink('ha.le@demo.test')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 29 * 60_000)
    expect((await accountRepository.getPasswordResetLink(token)).status).toBe('VALID')
    vi.setSystemTime(Date.now() + 2 * 60_000)
    expect((await accountRepository.getPasswordResetLink(token)).status).toBe('EXPIRED')
    expect(await fail(accountRepository.completePasswordReset(token, { newPassword: 'mat-khau-moi-1' }))).toMatchObject({ status: 422, code: 'RESET_LINK_EXPIRED' })
    expect(user('u-ha').password).toBeNull()
  })

  it('báo 404 cho token lạ, 422 khi tài khoản vừa bị khóa, 400 khi mật khẩu ngắn', async () => {
    expect(await fail(accountRepository.getPasswordResetLink('khong-co'))).toMatchObject({ status: 404, code: 'RESET_LINK_NOT_FOUND' })
    const token = await requestLink('ha.le@demo.test')
    expect(await fail(accountRepository.completePasswordReset(token, { newPassword: 'ngan' }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'newPassword' }] })
    user('u-ha').status = 'LOCKED'
    expect(await fail(accountRepository.completePasswordReset(token, { newPassword: 'mat-khau-moi-1' }))).toMatchObject({ status: 422, code: 'ACCOUNT_LOCKED' })
    expect(user('u-ha').password).toBeNull()
  })

  it('Admin gửi lại liên kết cũng tạo liên kết dùng được', async () => {
    signInAs('u-admin')
    const { adminRepository } = await import('../model/adminRepository')
    await adminRepository.sendPasswordReset('u-ha')
    expect(latestResetLinkFor('ha.le@demo.test')).toMatch(/^\/reset-password\?token=/)
  })
})

describe('resetPageState', () => {
  const link = (status: 'VALID' | 'EXPIRED' | 'USED') => ({ status, emailHint: 'ha***@demo.test', expiresAt: '2026-11-22T10:30:00+07:00' })

  it('nêu đúng màn hình theo token và kết quả kiểm liên kết', () => {
    expect(resetPageState({ token: '', done: false, link: undefined, error: null })).toBe('missing')
    expect(resetPageState({ token: 't', done: false, link: undefined, error: null })).toBe('checking')
    expect(resetPageState({ token: 't', done: false, link: link('VALID'), error: null })).toBe('valid')
    expect(resetPageState({ token: 't', done: false, link: link('EXPIRED'), error: null })).toBe('expired')
    expect(resetPageState({ token: 't', done: false, link: link('USED'), error: null })).toBe('used')
    expect(resetPageState({ token: 't', done: true, link: link('VALID'), error: null })).toBe('done')
  })
})

describe('useResetPasswordViewModel', () => {
  it('đặt mật khẩu từ liên kết trên URL rồi báo xong', async () => {
    const token = await requestLink('ha.le@demo.test')
    const { wrapper } = createTestWrapper(`/reset-password?token=${token}`)
    const { result } = renderHook(() => useResetPasswordViewModel(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('valid'))
    expect(result.current.emailHint).toBe('ha***@demo.test')

    act(() => result.current.form.reset({ newPassword: 'mat-khau-moi-1', confirmPassword: 'mat-khau-khac' }))
    await act(() => result.current.submit())
    expect(result.current.form.getFieldState('confirmPassword').error?.message).toBe('Mật khẩu nhập lại không khớp.')

    act(() => result.current.form.reset({ newPassword: 'mat-khau-moi-1', confirmPassword: 'mat-khau-moi-1' }))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(user('u-ha').password).toBe('mat-khau-moi-1')
  })

  it('liên kết hết hạn lúc đang nhập thì chuyển sang màn hết hạn', async () => {
    const token = await requestLink('ha.le@demo.test')
    const { wrapper } = createTestWrapper(`/reset-password?token=${token}`)
    const { result } = renderHook(() => useResetPasswordViewModel(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('valid'))

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 31 * 60_000)
    act(() => result.current.form.reset({ newPassword: 'mat-khau-moi-1', confirmPassword: 'mat-khau-moi-1' }))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.state).toBe('expired'))
  })

  it('token lạ thì báo liên kết không đúng', async () => {
    const { wrapper } = createTestWrapper('/reset-password?token=khong-co')
    const { result } = renderHook(() => useResetPasswordViewModel(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('notFound'))
  })
})

describe('useForgotPasswordViewModel: hộp thư demo', () => {
  it('trả liên kết vừa gửi cho tài khoản có thật, null khi không có thư', async () => {
    const { wrapper } = createTestWrapper('/forgot-password')
    const { result } = renderHook(() => useForgotPasswordViewModel(), { wrapper })
    act(() => result.current.form.setValue('email', 'ha.le@demo.test'))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.demoResetLink).toMatch(/^\/reset-password\?token=/))

    act(() => result.current.reset())
    act(() => result.current.form.setValue('email', 'khong.ai@demo.test'))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.sentTo).toBe('khong.ai@demo.test'))
    expect(result.current.demoResetLink).toBeNull()
  })
})
