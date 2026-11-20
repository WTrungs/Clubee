import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { usePermissionMatrixViewModel } from '../viewModel/usePermissionMatrixViewModel'
import { PermissionMatrixPanel } from './PermissionMatrixPanel'

// Bảng 7 cột chỉ hiện từ 1024 px; công tắc Radix cần ResizeObserver, jsdom không có cả hai.
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

async function wrapperFor(userId: string) {
  signInAs(userId)
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/structure?tab=permissions')
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

const lockedReason = 'Chủ nhiệm luôn giữ quyền này để CLB không mất người chỉnh bảng phân quyền.'
const override = (role: 'TREASURER' | 'VICE_PRESIDENT', permission: 'CONFIGURE_CLUB' | 'EDIT_PERMISSIONS', enabled: boolean) =>
  db.permissionOverrides.push({ clubId: 'c-guitar', role, permission, enabled, updatedBy: 'u-anh', updatedAt: '2026-11-16T10:00:00+07:00' })

describe('PermissionMatrixPanel (FR-ORG-05, BR-ACL-03, 04)', () => {
  it('explains locked cells in a visible legend tied to each switch', async () => {
    render(<PermissionMatrixPanel active />, { wrapper: await wrapperFor('u-anh') })
    const locked = await screen.findByRole('switch', { name: 'Chỉnh bảng phân quyền cho Chủ nhiệm' })
    expect(locked).toHaveAccessibleDescription(lockedReason)
    expect(within(screen.getByRole('list', { name: 'Chú giải' })).getByText(lockedReason)).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Quản lý thành viên cho Chủ nhiệm' })).toHaveAccessibleDescription('Bạn đang giữ chức vụ này nên không tự sửa quyền của nó.')
  })

  it('blocks resetting while there are unsaved changes', async () => {
    override('TREASURER', 'CONFIGURE_CLUB', false)
    const user = userEvent.setup()
    render(<PermissionMatrixPanel active />, { wrapper: await wrapperFor('u-anh') })
    const reset = await screen.findByRole('button', { name: 'Khôi phục mặc định' })
    expect(reset).toBeEnabled()
    await user.click(screen.getByRole('switch', { name: 'Quản lý thành viên cho Thủ quỹ' }))
    expect(reset).toBeDisabled()
    expect(reset).toHaveAccessibleDescription('Lưu hoặc hủy thay đổi chưa lưu trước khi khôi phục.')
    await user.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(reset).toBeEnabled()
  })

  it('locks the own row and locked cells, then saves a batch after confirming', async () => {
    const user = userEvent.setup()
    render(<PermissionMatrixPanel active />, { wrapper: await wrapperFor('u-anh') })
    const own = await screen.findByRole('switch', { name: 'Quản lý thành viên cho Chủ nhiệm' })
    expect(own).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Chỉnh bảng phân quyền cho Chủ nhiệm' })).toBeDisabled()
    expect(screen.getAllByText('Chủ nhiệm luôn giữ quyền này để CLB không mất người chỉnh bảng phân quyền.').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('switch', { name: 'Quản lý thành viên cho Thủ quỹ' }))
    expect(screen.getByText('1 thay đổi chưa lưu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Thủ quỹ: tắt Quản lý thành viên')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Lưu thay đổi quyền' })
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(db.permissionOverrides).toEqual([expect.objectContaining({ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false })]))
    await waitFor(() => expect(screen.queryByText('1 thay đổi chưa lưu')).not.toBeInTheDocument())
  })

  it('shows switches as read-only to the treasurer', async () => {
    render(<PermissionMatrixPanel active />, { wrapper: await wrapperFor('u-mai') })
    expect(await screen.findByText('Bạn chỉ xem được; người có quyền chỉnh bảng phân quyền mới sửa được.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Giao việc cho Trưởng ban' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Khôi phục mặc định' })).not.toBeInTheDocument()
  })
})

describe('usePermissionMatrixViewModel (NFR-REL-03)', () => {
  it('reports a conflict instead of overwriting, and drops unsaved changes on reload', async () => {
    const { result } = renderHook(() => usePermissionMatrixViewModel(true), { wrapper: await wrapperFor('u-anh') })
    await waitFor(() => expect(result.current.matrix).not.toBeNull())
    const cell = result.current.matrix?.cells.find((candidate) => candidate.role === 'TREASURER' && candidate.permission === 'MANAGE_MEMBERS')
    if (!cell) throw new Error('Thiếu ô')
    act(() => result.current.toggle(cell, false))
    expect(result.current.changes).toHaveLength(1)
    db.permissionMatrixMeta.push({ clubId: 'c-guitar', version: 5, updatedAt: '2026-11-16T10:00:00+07:00', updatedBy: 'u-huy' })
    act(() => result.current.confirmSave())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(db.permissionOverrides).toEqual([])
    act(() => result.current.reloadAfterConflict())
    expect(result.current.changes).toEqual([])
    await waitFor(() => expect(result.current.matrix?.version).toBe(5))
  })

  it('keeps unsaved changes on 403, shows the reason and reloads so switches lock', async () => {
    const { result } = renderHook(() => usePermissionMatrixViewModel(true), { wrapper: await wrapperFor('u-huy') })
    await waitFor(() => expect(result.current.canEdit).toBe(true))
    const cell = result.current.matrix?.cells.find((candidate) => candidate.role === 'TREASURER' && candidate.permission === 'MANAGE_MEMBERS')
    if (!cell) throw new Error('Thiếu ô')
    act(() => result.current.toggle(cell, false))
    act(() => result.current.openSave())
    // Chủ nhiệm vừa tắt quyền chỉnh bảng phân quyền của Phó chủ nhiệm trong lúc Phó chủ nhiệm đang sửa.
    override('VICE_PRESIDENT', 'EDIT_PERMISSIONS', false)
    act(() => result.current.confirmSave())
    await waitFor(() => expect(result.current.error?.message).toBe('Chỉ Chủ nhiệm được chỉnh bảng phân quyền.'))
    expect(result.current.conflict).toBe(false)
    expect(result.current.dialog).toBeNull()
    expect(result.current.changes).toHaveLength(1)
    expect(db.permissionOverrides).toHaveLength(1)
    await waitFor(() => expect(result.current.canEdit).toBe(false))
  })

  it('lists the locked-cell reasons on 422 and saves nothing', async () => {
    const { result } = renderHook(() => usePermissionMatrixViewModel(true), { wrapper: await wrapperFor('u-huy') })
    await waitFor(() => expect(result.current.matrix).not.toBeNull())
    const cell = result.current.matrix?.cells.find((candidate) => candidate.role === 'PRESIDENT' && candidate.permission === 'EDIT_PERMISSIONS')
    if (!cell) throw new Error('Thiếu ô')
    // Giả lập máy khách cũ tưởng ô này sửa được; máy chủ vẫn phải chặn.
    act(() => result.current.toggle({ ...cell, state: 'EDITABLE' }, false))
    act(() => result.current.confirmSave())
    await waitFor(() => expect(result.current.error?.details[0]).toContain('Chủ nhiệm luôn giữ'))
    expect(result.current.conflict).toBe(false)
    expect(result.current.changes).toHaveLength(1)
    expect(db.permissionOverrides).toEqual([])
  })
})
