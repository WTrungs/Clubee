import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/api/mocks/server'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { ClubMembershipSummary } from '../model/accountTypes'
import { pickCurrentClub } from './useClubSwitcherViewModel'
import { useForgotPasswordViewModel } from './useForgotPasswordViewModel'
import { useMyClubsViewModel } from './useMyClubsViewModel'
import { useRegisterViewModel } from './useRegisterViewModel'
import { useSession } from './useSession'

const membership = (clubId: string, memberStatus: ClubMembershipSummary['memberStatus'] = 'ACTIVE'): ClubMembershipSummary => ({
  clubId,
  clubName: clubId,
  shortName: clubId,
  logoUrl: null,
  field: '',
  memberStatus,
  departmentName: null,
  positionTitles: [],
  memberCount: 1,
  clubStatus: 'ACTIVE',
})

describe('pickCurrentClub (FR-ACC-06, IF-01)', () => {
  const memberships = [membership('a'), membership('b'), membership('p', 'PENDING')]

  it('uses the club in the route', () => {
    expect(pickCurrentClub(memberships, 'b', 'a')?.clubId).toBe('b')
  })

  it('shows nothing for a route club the user cannot enter', () => {
    expect(pickCurrentClub(memberships, 'p', null)).toBeNull()
    expect(pickCurrentClub(memberships, 'zzz', null)).toBeNull()
  })

  it('falls back to the last club, then the first enterable club', () => {
    expect(pickCurrentClub(memberships, undefined, 'b')?.clubId).toBe('b')
    expect(pickCurrentClub(memberships, undefined, 'p')?.clubId).toBe('a')
    expect(pickCurrentClub(memberships, undefined, null)?.clubId).toBe('a')
    expect(pickCurrentClub([membership('p', 'PENDING')], undefined, null)).toBeNull()
  })
})

describe('useRegisterViewModel (FR-ACC-01)', () => {
  const valid = (email: string) => {
    const password = `Aa1!${crypto.randomUUID()}`
    return { fullName: 'Nguyễn Văn Thử', email, password, confirmPassword: password }
  }

  it('attaches the duplicate-email error to the email field only', async () => {
    const { wrapper } = createTestWrapper('/register')
    const { result } = renderHook(() => useRegisterViewModel(), { wrapper })
    act(() => result.current.form.reset(valid('ha.le@demo.test')))
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.form.getFieldState('email').error?.message).toContain('Email đã được đăng ký'))
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.registeredEmail).toBeNull()
  })

  it('shows a general message when the server cannot be reached', async () => {
    server.use(http.post('*/api/v1/auth/register', () => HttpResponse.error()))
    const { wrapper } = createTestWrapper('/register')
    const { result } = renderHook(() => useRegisterViewModel(), { wrapper })
    act(() => result.current.form.reset(valid('moi@demo.test')))
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.errorMessage).toContain('Không kết nối được máy chủ'))
  })

  it('reports the address to verify only after the server accepted it', async () => {
    const { wrapper } = createTestWrapper('/register')
    const { result } = renderHook(() => useRegisterViewModel(), { wrapper })
    act(() => result.current.form.reset(valid('ban.moi@demo.test')))
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.registeredEmail).toBe('ban.moi@demo.test'))
  })
})

describe('useForgotPasswordViewModel (FR-ACC-03)', () => {
  it('confirms only after the server answered 202', async () => {
    const { wrapper } = createTestWrapper('/forgot-password')
    const { result } = renderHook(() => useForgotPasswordViewModel(), { wrapper })
    act(() => result.current.form.setValue('email', 'ai.do@demo.test'))
    expect(result.current.sentTo).toBeNull()
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.sentTo).toBe('ai.do@demo.test'))
  })

  it('shows the error and no confirmation when the request fails', async () => {
    server.use(http.post('*/api/v1/auth/password-reset-requests', () => HttpResponse.error()))
    const { wrapper } = createTestWrapper('/forgot-password')
    const { result } = renderHook(() => useForgotPasswordViewModel(), { wrapper })
    act(() => result.current.form.setValue('email', 'ai.do@demo.test'))
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.errorMessage).toContain('Không kết nối được máy chủ'))
    expect(result.current.sentTo).toBeNull()
  })
})

describe('useMyClubsViewModel', () => {
  it('filters clubs without caring about Vietnamese accents', async () => {
    signInAs('u-anh')
    const { wrapper } = createTestWrapper('/clubs')
    const { result } = renderHook(() => ({ session: useSession() }), { wrapper })
    await waitFor(() => expect(result.current.session.data).toBeTruthy())

    const clubs = renderHook(() => useMyClubsViewModel(), { wrapper })
    act(() => clubs.result.current.setKeyword('tinh nguyen'))
    expect(clubs.result.current.memberships.map((item) => item.clubId)).toEqual(['c-volunteer'])
    act(() => clubs.result.current.setKeyword(''))
    expect(clubs.result.current.memberships).toHaveLength(2)
    expect(clubs.result.current.canEnter('PENDING')).toBe(false)
  })
})
