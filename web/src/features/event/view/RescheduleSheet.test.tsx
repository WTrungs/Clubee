import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { formatDate } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import type { EventDetail } from '../model/eventTypes'
import { formatEventTime } from '../viewModel/eventDisplay'
import { useRescheduleViewModel } from '../viewModel/useRescheduleViewModel'
import { RescheduleSheet } from './RescheduleSheet'

function Harness({ event }: { event: EventDetail }) {
  const vm = useRescheduleViewModel('c-guitar', event)
  return (
    <>
      <button type="button" onClick={vm.openSheet}>
        Mở
      </button>
      <RescheduleSheet event={event} vm={vm} />
    </>
  )
}

async function openAs(userId: string) {
  signInAs(userId)
  const event = await eventRepository.get('c-guitar', 'e-winter')
  const { wrapper } = createTestWrapper()
  render(<Harness event={event} />, { wrapper })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Mở' }))
  return { user, event, dialog: await screen.findByRole('dialog', { name: 'Dời thời gian' }) }
}

describe('RescheduleSheet (FR-EVT-14)', () => {
  it('opens on the current time and warns who must confirm again', async () => {
    const { dialog, event } = await openAs('u-bao')
    expect(screen.getByRole('textbox', { name: /^Bắt đầu mới/ })).toHaveValue(formatDate(event.startAt))
    expect(dialog).toHaveAccessibleDescription(`Giờ hiện tại: ${formatEventTime(event)}.`)
    expect(within(dialog).getByText(/^11 người đang giữ chỗ sẽ chuyển sang Chờ xác nhận lại/)).toBeInTheDocument()
  })

  it('asks for a reason before sending and names an unchanged time', async () => {
    const { user } = await openAs('u-bao')
    await user.click(screen.getByRole('button', { name: 'Dời thời gian' }))
    expect(await screen.findByText('Nhập lý do ít nhất 5 ký tự.')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Lý do/ }), 'Hội trường bận sửa chữa.')
    await user.click(screen.getByRole('button', { name: 'Dời thời gian' }))
    expect(await screen.findByText('Thời gian mới trùng thời gian hiện tại.')).toBeInTheDocument()
  })

  it('closes after the server saves the new time', async () => {
    const { user } = await openAs('u-bao')
    const later = formatDate(new Date(Date.now() + 20 * 24 * 60 * 60 * 1000))
    for (const name of [/^Bắt đầu mới/, /^Kết thúc mới/]) {
      const input = screen.getByRole('textbox', { name })
      await user.clear(input)
      await user.type(input, later)
    }
    await user.type(screen.getByRole('textbox', { name: /^Lý do/ }), 'Hội trường bận sửa chữa.')
    await user.click(screen.getByRole('button', { name: 'Dời thời gian' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dời thời gian' })).not.toBeInTheDocument())
    expect(db.events.find((event) => event.id === 'e-winter')?.scheduleChanges).toHaveLength(1)
  })
})
