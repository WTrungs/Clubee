import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { useCoHostInvitationsViewModel } from '../viewModel/useCoHostInvitationsViewModel'
import { SharedEventsPanel } from './SharedEventsPanel'

function Harness({ clubId }: { clubId: string }) {
  const vm = useCoHostInvitationsViewModel(clubId, true)
  return <SharedEventsPanel vm={vm} />
}

function renderAs(userId: string, clubId = 'c-english') {
  signInAs(userId)
  const { wrapper } = createTestWrapper()
  render(<Harness clubId={clubId} />, { wrapper })
  return userEvent.setup()
}

describe('SharedEventsPanel (FR-EVT-08)', () => {
  it('shows a pending invitation with the host club, message and both answers', async () => {
    renderAs('u-tu')
    const pending = await screen.findByRole('region', { name: 'Chờ trả lời (1)' })
    expect(within(pending).getByText('Đêm nhạc Mùa đông')).toBeInTheDocument()
    expect(within(pending).getByText('Chủ trì: CLB Guitar Sinh viên')).toBeInTheDocument()
    expect(within(pending).getByText('“Mời CLB Tiếng Anh cùng tổ chức phần giao lưu song ngữ.”')).toBeInTheDocument()
    expect(within(pending).getByRole('button', { name: 'Chấp nhận đồng tổ chức Đêm nhạc Mùa đông' })).toBeEnabled()
    expect(within(pending).getByRole('button', { name: 'Từ chối đồng tổ chức Đêm nhạc Mùa đông' })).toBeEnabled()
  })

  it('needs a reason to decline, then lists the invitation under history', async () => {
    const user = renderAs('u-tu')
    await user.click(await screen.findByRole('button', { name: 'Từ chối đồng tổ chức Đêm nhạc Mùa đông' }))
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối đồng tổ chức Đêm nhạc Mùa đông' })
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối lời mời' }))
    expect(within(dialog).getByText('Vui lòng nhập ít nhất 5 ký tự.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Lịch học dày tháng này.')
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối lời mời' }))
    const history = await screen.findByRole('region', { name: 'Lịch sử (1)' })
    expect(within(history).getByText('Lý do từ chối: Lịch học dày tháng này.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Chờ trả lời/ })).not.toBeInTheDocument()
  })

  it('shows an empty state when the club has no invitation', async () => {
    // Đội Tình nguyện Xanh chưa nhận lời mời nào.
    renderAs('u-tam', 'c-volunteer')
    expect(await screen.findByText('Chưa có sự kiện chung')).toBeInTheDocument()
  })

  it('shows no buttons on an invitation the board can no longer answer', async () => {
    const winter = db.events.find((event) => event.id === 'e-winter')
    if (winter) winter.status = 'CANCELLED'
    renderAs('u-tu')
    const pending = await screen.findByRole('region', { name: 'Chờ trả lời (1)' })
    await waitFor(() => expect(within(pending).queryByRole('button')).not.toBeInTheDocument())
    expect(within(pending).getByText('Sự kiện đã hủy hoặc đã đóng nên lời mời không trả lời được nữa.')).toBeInTheDocument()
  })
})
