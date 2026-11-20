import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { endSession } from '@/api/mocks/mockSession'
import { createTestWrapper, signInAs } from '@/testUtils'
import { accountRepository } from '../model/accountRepository'
import type { Profile } from '../model/accountTypes'
import { useChangePasswordViewModel } from './useChangePasswordViewModel'
import { useAvatarUpload, useEmailChangeForm, useProfile, useProfileInfoForm } from './useProfileForms'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const userHa = () => db.users.find((user) => user.id === 'u-ha')
const seededHa = () => {
  const ha = userHa()
  if (!ha) throw new Error('Thiếu u-ha trong seed')
  return ha
}
const userProfile = (): Profile => {
  const ha = seededHa()
  return { fullName: ha.fullName, email: ha.email, pendingEmail: ha.pendingEmail, phone: ha.phone, birthDate: ha.birthDate, avatarUrl: ha.avatarUrl, version: ha.version }
}

describe('profile API (FR-ACC-05, NFR-REL-03)', () => {
  it('saves name, phone and birth date, and refuses a stale version', async () => {
    signInAs('u-ha')
    const profile = await accountRepository.getProfile()
    const saved = await accountRepository.updateProfile({ fullName: 'Lê Thu Hà Mới', phone: '0912345678', birthDate: '2004-03-09', version: profile.version })
    expect(saved).toMatchObject({ fullName: 'Lê Thu Hà Mới', phone: '0912345678', birthDate: '2004-03-09', version: profile.version + 1 })
    expect((await accountRepository.getMe()).fullName).toBe('Lê Thu Hà Mới')

    const stale = await fail(accountRepository.updateProfile({ fullName: 'Ghi đè', phone: null, birthDate: null, version: profile.version }))
    expect(stale?.status).toBe(409)
    expect(userHa()?.fullName).toBe('Lê Thu Hà Mới')
  })

  it('keeps the old email until the new one is verified, and needs the current password', async () => {
    signInAs('u-ha')
    const wrong = await fail(accountRepository.requestEmailChange({ newEmail: 'ha.moi@demo.test', currentPassword: 'ngan' }))
    expect(wrong?.fieldErrors.map((error) => error.field)).toEqual(['currentPassword'])
    const taken = await fail(accountRepository.requestEmailChange({ newEmail: 'anh.nguyen@demo.test', currentPassword: 'matkhau-demo' }))
    expect(taken?.status).toBe(409)

    expect(await accountRepository.requestEmailChange({ newEmail: 'Ha.Moi@demo.test', currentPassword: 'matkhau-demo' })).toEqual({ pendingEmail: 'ha.moi@demo.test' })
    expect(await accountRepository.getProfile()).toMatchObject({ email: 'ha.le@demo.test', pendingEmail: 'ha.moi@demo.test' })
  })
})

describe('change password (FR-ACC-04)', () => {
  it('needs the current password, then only the new password signs in', async () => {
    signInAs('u-ha')
    const wrong = await fail(accountRepository.changePassword({ currentPassword: 'ngan', newPassword: 'MatKhauMoi#2026' }))
    expect(wrong?.fieldErrors.map((error) => error.field)).toEqual(['currentPassword'])
    await accountRepository.changePassword({ currentPassword: 'matkhau-demo', newPassword: 'MatKhauMoi#2026' })

    endSession()
    expect((await fail(accountRepository.login({ email: 'ha.le@demo.test', password: 'matkhau-demo' })))?.status).toBe(401)
    expect((await accountRepository.login({ email: 'ha.le@demo.test', password: 'MatKhauMoi#2026' })).id).toBe('u-ha')
  })

  it('reports a wrong current password on its field and clears the form after success', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useChangePasswordViewModel(), { wrapper })
    act(() => {
      result.current.form.setValue('currentPassword', 'ngan')
      result.current.form.setValue('newPassword', 'MatKhauMoi#2026')
      result.current.form.setValue('confirmPassword', 'MatKhauMoi#2026')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.formState.errors.currentPassword?.message).toBe('Mật khẩu hiện tại không đúng.'))
    expect(result.current.errorMessage).toBeNull()

    act(() => result.current.form.setValue('currentPassword', 'matkhau-demo'))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getValues('newPassword')).toBe(''))
  })
})

describe('profile view models (FR-ACC-05)', () => {
  it('shows the conflict banner instead of overwriting, then reloads the latest profile', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const loaded = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(loaded.result.current.data).toBeDefined())
    const profile = loaded.result.current.data
    if (!profile) throw new Error('Hồ sơ chưa tải')
    const { result } = renderHook(() => useProfileInfoForm(profile), { wrapper })

    const ha = seededHa()
    Object.assign(ha, { fullName: 'Tên do nơi khác sửa', version: ha.version + 1 })
    act(() => result.current.form.setValue('phone', '0912345678', { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.errorMessage).toBeNull()
    expect(userHa()?.phone).not.toBe('0912345678')

    await act(() => result.current.reload())
    expect(result.current.conflict).toBe(false)
    expect(result.current.form.getValues('fullName')).toBe('Tên do nơi khác sửa')
  })

  it('saves with the version the user started from: a change made elsewhere during editing gives 409, not an overwrite', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const start = await accountRepository.getProfile()
    const { result, rerender } = renderHook(({ profile }: { profile: Profile }) => useProfileInfoForm(profile), { wrapper, initialProps: { profile: start } })
    act(() => result.current.form.setValue('phone', '0912345678', { shouldDirty: true }))

    const ha = seededHa()
    Object.assign(ha, { fullName: 'Tên do nơi khác sửa', version: ha.version + 1 })
    rerender({ profile: await accountRepository.getProfile() })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(userHa()).toMatchObject({ fullName: 'Tên do nơi khác sửa', phone: '0900 000 103' })
  })

  it('loads a newer profile into an untouched form, and keeps edits when only the avatar changed', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const start = await accountRepository.getProfile()
    const { result, rerender } = renderHook(({ profile }: { profile: Profile }) => useProfileInfoForm(profile), { wrapper, initialProps: { profile: start } })

    const ha = seededHa()
    Object.assign(ha, { fullName: 'Tên mới', version: ha.version + 1 })
    rerender({ profile: await accountRepository.getProfile() })
    await waitFor(() => expect(result.current.form.getValues('fullName')).toBe('Tên mới'))

    act(() => result.current.form.setValue('phone', '0912345678', { shouldDirty: true }))
    Object.assign(ha, { avatarUrl: 'data:image/png;base64,AA==', version: ha.version + 1 })
    rerender({ profile: await accountRepository.getProfile() })
    await act(() => result.current.submit())
    await waitFor(() => expect(userHa()?.phone).toBe('0912345678'))
    expect(result.current.conflict).toBe(false)
    expect(userHa()?.fullName).toBe('Tên mới')
  })

  it('saves, normalizes the phone and puts a server field error on its field', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useProfileInfoForm(userProfile()), { wrapper })
    act(() => result.current.form.setValue('phone', '091 234 5678', { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getValues('phone')).toBe('0912345678'))
    expect(result.current.dirty).toBe(false)

    let calls = 0
    server.use(
      http.patch('*/api/v1/me/profile', () => {
        calls += 1
        return problem(400, 'Thông tin cá nhân chưa hợp lệ.', 'VALIDATION', [{ field: 'phone', message: 'Số này đã bị chặn.' }])
      }),
    )
    act(() => result.current.form.setValue('phone', '0987654321', { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getFieldState('phone').error?.message).toBe('Số này đã bị chặn.'))
    expect(calls).toBe(1)
    expect(userHa()?.phone).toBe('0912345678')
    expect(result.current.errorMessage).toBeNull()
  })

  it('checks the avatar file before sending it', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useAvatarUpload(), { wrapper })
    act(() => result.current.upload(new File(['x'], 'anh.gif', { type: 'image/gif' })))
    expect(result.current.errorMessage).toBe('Ảnh đại diện chỉ nhận tệp JPG hoặc PNG.')
    expect(result.current.pending).toBe(false)
  })

  it('puts a taken email error on the email field', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useEmailChangeForm(), { wrapper })
    act(() => {
      result.current.form.setValue('newEmail', 'anh.nguyen@demo.test')
      result.current.form.setValue('currentPassword', 'matkhau-demo')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.formState.errors.newEmail?.message).toBe('Email đã thuộc một tài khoản khác.'))
  })
})
