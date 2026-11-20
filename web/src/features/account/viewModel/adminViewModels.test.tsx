import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { AdminOnly, RequireAuth, UserOnly } from '../view/RequireAuth'
import { accountStatusDisplay, clubCountText, lastLoginText, lockLine } from './adminDisplay'
import { useAdminAccountsViewModel } from './useAdminAccountsViewModel'

afterEach(() => vi.restoreAllMocks())

describe('admin display (FR-ACC-09)', () => {
  it('labels account states, logins, clubs and the lock reason', () => {
    expect(accountStatusDisplay.LOCKED).toEqual({ label: 'Bị khóa', tone: 'danger' })
    expect(lastLoginText(null)).toBe('Chưa đăng nhập lần nào')
    expect(lastLoginText('2026-11-16T08:30:00+07:00')).toBe('Đăng nhập lần cuối 16/11/2026 08:30')
    expect(clubCountText(0)).toBe('Chưa tham gia CLB nào')
    expect(clubCountText(2)).toBe('Đang tham gia 2 CLB')
    expect(lockLine({ status: 'LOCKED', lockReason: 'Spam.', lockedAt: '2026-11-01T10:00:00+07:00' })).toBe('Khóa lúc 01/11/2026 10:00: Spam.')
    expect(lockLine({ status: 'ACTIVE', lockReason: null, lockedAt: null })).toBeNull()
  })
})

describe('useAdminAccountsViewModel (FR-ACC-09, NFR-REL-03)', () => {
  it('waits for three characters, then reports a conflict instead of locking a changed account', async () => {
    signInAs('u-admin')
    const { wrapper } = createTestWrapper('/admin/accounts')
    const { result } = renderHook(() => useAdminAccountsViewModel(), { wrapper })
    act(() => result.current.setEmail('ha'))
    expect(result.current.needsMoreInput).toBe(true)
    expect(result.current.accounts).toEqual([])

    act(() => result.current.setEmail('ha.le'))
    await waitFor(() => expect(result.current.accounts.map((account) => account.id)).toEqual(['u-ha']))
    const ha = result.current.accounts[0]
    if (!ha) throw new Error('Thiếu u-ha')
    const stored = db.users.find((user) => user.id === 'u-ha')
    if (stored) stored.version += 1

    act(() => result.current.openDialog(ha, 'LOCK'))
    act(() => result.current.confirmTransition('Gửi tin nhắn rác.'))
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.dialog).toBeNull()
    expect(stored?.status).toBe('ACTIVE')
  })
})

describe('routes by account type (SRS 3.4, NFR-SEC-06)', () => {
  function renderRoutes(path: string) {
    const { wrapper } = createTestWrapper(path)
    render(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<UserOnly />}>
            <Route path="/clubs" element={<p>CLB của tôi</p>} />
          </Route>
          <Route element={<AdminOnly />}>
            <Route path="/admin" element={<p>Khu quản trị</p>} />
          </Route>
        </Route>
      </Routes>,
      { wrapper },
    )
  }

  it('sends an admin opening club pages to the admin area', async () => {
    signInAs('u-admin')
    renderRoutes('/clubs')
    expect(await screen.findByText('Khu quản trị')).toBeInTheDocument()
  })

  it('tells a normal account why the admin area is closed, with a way back', async () => {
    signInAs('u-ha')
    renderRoutes('/admin')
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument()
    expect(screen.getByText('Trang này chỉ dành cho quản trị hệ thống. Tài khoản của bạn là tài khoản thành viên CLB.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về CLB của tôi' })).toHaveAttribute('href', '/clubs')
    expect(screen.queryByText('Khu quản trị')).not.toBeInTheDocument()
  })
})
