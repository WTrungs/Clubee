import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionQueryKey } from '@/api/queryClient'
import { createTestWrapper } from '@/testUtils'
import type { CurrentUser } from '../model/accountTypes'
import { useLoginViewModel } from './useLoginViewModel'

const anyPassword = () => crypto.randomUUID()

describe('useLoginViewModel', () => {
  it('shows the server reason and keeps the session empty on bad credentials', async () => {
    const { wrapper, queryClient } = createTestWrapper('/login')
    const { result } = renderHook(() => useLoginViewModel(), { wrapper })

    act(() => {
      result.current.form.setValue('email', 'nobody@demo.test')
      result.current.form.setValue('password', anyPassword())
    })
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.errorMessage).toBe('Email hoặc mật khẩu không đúng.'))
    expect(queryClient.getQueryData(sessionQueryKey)).toBeUndefined()
  })

  it('stores the signed-in user only after the server confirms', async () => {
    const { wrapper, queryClient } = createTestWrapper('/login')
    const { result } = renderHook(() => useLoginViewModel(), { wrapper })

    act(() => {
      result.current.pickDemoAccount('anh.nguyen@demo.test')
      result.current.form.setValue('password', anyPassword())
    })
    await act(() => result.current.submit())

    await waitFor(() => expect(queryClient.getQueryData<CurrentUser>(sessionQueryKey)?.fullName).toBe('Nguyễn Minh Anh'))
    const user = queryClient.getQueryData<CurrentUser>(sessionQueryKey)
    expect(user?.memberships.map((membership) => membership.clubId)).toContain('c-guitar')
    expect(user?.memberships.find((membership) => membership.clubId === 'c-guitar')?.positionTitles).toEqual(['Chủ nhiệm'])
  })

  it('rejects invalid input before calling the server', async () => {
    const { wrapper } = createTestWrapper('/login')
    const { result } = renderHook(() => useLoginViewModel(), { wrapper })
    await act(() => result.current.submit())
    expect(result.current.form.getFieldState('email').error?.message).toBe('Vui lòng nhập email.')
    expect(result.current.pending).toBe(false)
  })
})
