import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { InvitationPage } from '../view/InvitationPage'
import { useInvitationsViewModel } from './useInvitationsViewModel'

afterEach(() => vi.restoreAllMocks())

async function renderInvitations() {
  signInAs('u-anh')
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  const rendered = renderHook(() => useInvitationsViewModel(true), { wrapper })
  await waitFor(() => expect(rendered.result.current.loading).toBe(false))
  return rendered
}

describe('useInvitationsViewModel (FR-MEM-01)', () => {
  it('creates a link, shows it at the top and refreshes the list', async () => {
    const success = vi.spyOn(toast, 'success')
    const { result } = await renderInvitations()
    expect(result.current.invitations).toHaveLength(2)
    act(() => result.current.createLink())
    await waitFor(() => expect(result.current.created?.kind).toBe('LINK'))
    await waitFor(() => expect(result.current.invitations).toHaveLength(3))
    expect(result.current.invitations[0]?.id).toBe(result.current.created?.id)
    expect(success).toHaveBeenCalledWith('Đã tạo liên kết mời.')
  })

  it('puts a server refusal on the email field instead of a general alert', async () => {
    const { result } = await renderInvitations()
    act(() => result.current.emailForm.setValue('email', 'ha.le@demo.test'))
    await act(() => result.current.submitEmail())
    await waitFor(() => expect(result.current.emailForm.formState.errors.email?.message).toBe('Người này đã là thành viên.'))
    expect(result.current.createError).toBeNull()
    expect(result.current.created).toBeNull()
  })

  it('copies the full link, and offers a read-only field when the browser blocks the clipboard', async () => {
    const success = vi.spyOn(toast, 'success')
    const { result } = await renderInvitations()
    // jsdom không có clipboard nên lần đầu rơi vào ô dự phòng, đặt đúng dưới dòng vừa bấm.
    await act(() => result.current.copy('demo-guitar', 'list'))
    expect(result.current.copyFallbackFor('list', 'demo-guitar')).toBe(`${window.location.origin}/invite/demo-guitar`)
    expect(result.current.copyFallbackFor('created', 'demo-guitar')).toBeNull()
    expect(result.current.copyFallbackFor('list', 'demo-guitar-old')).toBeNull()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      await act(() => result.current.copy('demo-guitar', 'list'))
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/demo-guitar`)
      expect(result.current.copyFallback).toBeNull()
      expect(success).toHaveBeenCalledWith('Đã sao chép liên kết mời.')
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('reports a conflict when the invitation changed, and revokes with the fresh version', async () => {
    const { result } = await renderInvitations()
    const link = result.current.invitations.find((invitation) => invitation.id === 'inv-guitar-link')
    if (!link) throw new Error('Thiếu inv-guitar-link')
    const stored = db.invitations.find((invitation) => invitation.id === link.id)
    if (stored) stored.version += 1

    act(() => result.current.askRevoke(link))
    act(() => result.current.confirmRevoke())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.revoking).toBeNull()
    expect(stored?.revokedAt).toBeNull()

    act(() => result.current.reloadAfterConflict())
    await waitFor(() => expect(result.current.invitations.find((invitation) => invitation.id === link.id)?.version).toBe(2))
    const fresh = result.current.invitations.find((invitation) => invitation.id === link.id)
    if (!fresh) throw new Error('Thiếu lời mời sau khi tải lại')
    act(() => result.current.askRevoke(fresh))
    act(() => result.current.confirmRevoke())
    await waitFor(() => expect(result.current.invitations.find((invitation) => invitation.id === link.id)?.status).toBe('REVOKED'))
  })
})

describe('InvitationPage (FR-MEM-01, FR-MEM-02)', () => {
  function renderPage(token: string) {
    const { wrapper } = createTestWrapper(`/invite/${token}`)
    return render(
      <Routes>
        <Route path="/invite/:token" element={<InvitationPage />} />
      </Routes>,
      { wrapper },
    )
  }

  it('lets someone outside the club send a request through the link, then shows it is pending', async () => {
    signInAs('u-tu')
    const user = userEvent.setup()
    renderPage('demo-guitar')
    expect(await screen.findByRole('heading', { name: 'CLB Guitar Sinh viên' })).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Minh Anh')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xin gia nhập' }))
    await user.type(screen.getByRole('textbox', { name: 'Lời giới thiệu' }), 'Mình chơi guitar được một năm, muốn tham gia các đêm nhạc.')
    await user.type(screen.getByRole('textbox', { name: 'MSSV' }), 'SV26001')
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))
    expect(await screen.findByText('Yêu cầu của bạn đang chờ duyệt')).toBeInTheDocument()
    expect(db.memberships.find((membership) => membership.userId === 'u-tu' && membership.clubId === 'c-guitar')).toMatchObject({
      status: 'PENDING',
      invitationId: 'inv-guitar-link',
    })
  })

  it('explains an expired invitation and points to the club directory', async () => {
    signInAs('u-tam')
    renderPage('demo-guitar-old')
    expect(await screen.findByText('Lời mời đã hết hạn')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xin gia nhập' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tìm CLB' })).toHaveAttribute('href', '/directory')
  })

  it('shows the server reason when the email invitation belongs to someone else', async () => {
    signInAs('u-ha')
    renderPage('demo-guitar-old')
    expect(await screen.findByText('Lời mời này gửi tới một email khác. Hãy đăng nhập bằng tài khoản có email được mời.')).toBeInTheDocument()
  })
})
