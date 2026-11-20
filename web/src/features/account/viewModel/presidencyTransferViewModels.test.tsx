import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { hasPosition } from '@/api/mocks/mockPermissions'
import { nowIso } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { presidencyTransferRepository } from '../model/presidencyTransferRepository'
import { boardCheckText, transferStatusDisplay } from './presidencyTransferDisplay'
import { useAdminTransfersViewModel } from './useAdminTransfersViewModel'
import { usePresidencyTransferViewModel } from './usePresidencyTransferViewModel'

afterEach(() => vi.restoreAllMocks())
const REASON = 'Chủ nhiệm không liên lạc được hơn một tháng, đội cần người điều hành.'

describe('presidency transfer display (FR-ACC-08)', () => {
  it('labels statuses and the board check', () => {
    expect(transferStatusDisplay.APPROVED).toEqual({ label: 'Đã chuyển quyền', tone: 'success' })
    expect(boardCheckText({ boardInactive: true, inactiveDays: 30, lastBoardLoginAt: '2026-10-01T20:00:00+07:00', checkedAt: '' })).toBe(
      'ban chủ nhiệm không đăng nhập quá 30 ngày (lần cuối 01/10/2026 20:00)',
    )
    expect(boardCheckText({ boardInactive: false, inactiveDays: 30, lastBoardLoginAt: null, checkedAt: '' })).toBe('ban chủ nhiệm đã đăng nhập trong 30 ngày qua')
  })
})

describe('usePresidencyTransferViewModel (FR-ACC-08)', () => {
  async function renderFor(userId: string, clubId: string) {
    signInAs(userId)
    const club = await clubRepository.getClub(clubId)
    const { wrapper: Base } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
      </Base>
    )
    return renderHook(() => usePresidencyTransferViewModel(), { wrapper })
  }

  it('stays hidden while the board is active', async () => {
    const { result } = await renderFor('u-ha', 'c-guitar')
    await waitFor(() => expect(result.current.boardInactive).toBe(false))
    expect(result.current.visible).toBe(false)
  })

  it('sends a request, then shows it as pending and lets the requester cancel it', async () => {
    const success = vi.spyOn(toast, 'success')
    const { result } = await renderFor('u-anh', 'c-volunteer')
    await waitFor(() => expect(result.current.canRequest).toBe(true))
    expect(result.current.visible).toBe(true)
    act(() => result.current.openRequest())
    act(() => result.current.sendRequest(REASON))
    await waitFor(() => expect(result.current.pending?.mine).toBe(true))
    expect(result.current.canRequest).toBe(false)
    expect(result.current.dialog).toBeNull()
    expect(success).toHaveBeenCalledWith('Đã gửi yêu cầu chuyển quyền. Quản trị hệ thống sẽ xem xét.')

    act(() => result.current.openCancel())
    act(() => result.current.confirmCancel())
    await waitFor(() => expect(result.current.pending).toBeNull())
    expect(db.transferRequests[0]?.status).toBe('CANCELLED')
  })
})

describe('useAdminTransfersViewModel (FR-ACC-08)', () => {
  async function renderAdmin() {
    signInAs('u-anh')
    await presidencyTransferRepository.request('c-volunteer', REASON)
    signInAs('u-admin')
    const { wrapper } = createTestWrapper('/admin/transfers')
    const rendered = renderHook(() => useAdminTransfersViewModel(), { wrapper })
    await waitFor(() => expect(rendered.result.current.requests).toHaveLength(1))
    return rendered
  }

  it('needs a person and a note, then moves the presidency and closes the request', async () => {
    const { result } = await renderAdmin()
    const request = result.current.requests[0]
    if (!request) throw new Error('Thiếu yêu cầu')
    act(() => result.current.openRequest(request))
    await waitFor(() => expect(result.current.candidates.length).toBe(3))
    act(() => result.current.requestApprove())
    expect(result.current.selectionError).toBe('Chọn Chủ nhiệm mới.')
    expect(result.current.noteError).toBe('Nhập từ 5 đến 1000 ký tự.')
    expect(result.current.confirming).toBe(false)

    act(() => {
      result.current.setNewPresidentId('u-hieu')
      result.current.setNote('Đã xác minh với các thành viên.')
    })
    act(() => result.current.requestApprove())
    expect(result.current.confirming).toBe(true)
    expect(result.current.newPresidentName).toBe('Lương Trung Hiếu')
    act(() => result.current.approve())
    await waitFor(() => expect(result.current.selected).toBeNull())
    expect(hasPosition('u-hieu', 'PRESIDENT', 'c-volunteer')).toBe(true)
    await waitFor(() => expect(result.current.requests).toHaveLength(0))
  })

  it('says when no member is left to take the role, and puts a server refusal on the picker', async () => {
    const { result } = await renderAdmin()
    const request = result.current.requests[0]
    if (!request) throw new Error('Thiếu yêu cầu')
    act(() => result.current.openRequest(request))
    await waitFor(() => expect(result.current.candidates.length).toBe(3))
    act(() => {
      result.current.setNewPresidentId('u-hieu')
      result.current.setNote('Đã xác minh với các thành viên.')
    })
    // Hiếu vừa chuyển Tạm nghỉ trong lúc Admin đang xem.
    const hieu = db.memberships.find((membership) => membership.userId === 'u-hieu' && membership.clubId === 'c-volunteer')
    if (hieu) hieu.status = 'ON_LEAVE'
    act(() => result.current.requestApprove())
    act(() => result.current.approve())
    await waitFor(() => expect(result.current.selectionError).toBe('Chọn một thành viên Chính thức của CLB này.'))
    await waitFor(() => expect(result.current.candidates.map((candidate) => candidate.id)).not.toContain('u-hieu'))

    for (const membership of db.memberships.filter((candidate) => candidate.clubId === 'c-volunteer' && candidate.userId !== 'u-tam')) membership.status = 'ON_LEAVE'
    act(() => result.current.retryCandidates())
    await waitFor(() => expect(result.current.noCandidates).toBe(true))
  })

  it('shows that only a rejection is left once the board signs in again', async () => {
    const { result } = await renderAdmin()
    const request = result.current.requests[0]
    if (!request) throw new Error('Thiếu yêu cầu')
    act(() => result.current.openRequest(request))
    expect(result.current.canApprove).toBe(true)
    const tam = db.users.find((user) => user.id === 'u-tam')
    if (tam) tam.lastLoginAt = nowIso()
    act(() => {
      result.current.setNewPresidentId('u-anh')
      result.current.setNote('Đã xác minh với các thành viên.')
    })
    act(() => result.current.requestApprove())
    act(() => result.current.approve())
    // Máy chủ trả 422 BOARD_ACTIVE; yêu cầu đang mở được cập nhật theo kết quả kiểm mới.
    await waitFor(() => expect(result.current.canApprove).toBe(false))
    expect(result.current.selected?.id).toBe(request.id)
    expect(hasPosition('u-tam', 'PRESIDENT', 'c-volunteer')).toBe(true)
  })
})
