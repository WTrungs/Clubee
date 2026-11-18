import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { donePercent, progressSummary } from '../viewModel/useEventProgressViewModel'
import { EventProgressTab } from './EventProgressTab'

const counts = (patch: Partial<Parameters<typeof progressSummary>[0]>) => ({ total: 0, assigned: 0, inProgress: 0, pendingReview: 0, done: 0, overdue: 0, ...patch })

describe('progress display (FR-EVT-09)', () => {
  it('rounds the done share down and says when there is nothing yet', () => {
    expect(donePercent({ total: 0, done: 0 })).toBeNull()
    expect(donePercent({ total: 3, done: 2 })).toBe(66)
    expect(donePercent({ total: 250, done: 249 })).toBe(99)
    expect(progressSummary(counts({}))).toBe('Chưa có việc')
    expect(progressSummary(counts({ total: 5, done: 3 }))).toBe('3/5 việc hoàn thành')
    expect(progressSummary(counts({ total: 5, done: 3, overdue: 1 }))).toBe('3/5 việc hoàn thành · 1 quá hạn')
  })
})

describe('EventProgressTab (FR-EVT-09)', () => {
  it('shows each subcommittee with its bar and overdue count', async () => {
    // Một việc quá hạn ở tiểu ban Hậu cần để thấy nhãn quá hạn.
    const task = db.tasks.find((candidate) => candidate.scopeType === 'SUBCOMMITTEE' && candidate.scopeId === 'sc-winter-logistics' && candidate.status !== 'DONE' && candidate.status !== 'CANCELLED')
    if (!task) throw new Error('Thiếu việc của tiểu ban Hậu cần')
    task.dueAt = new Date(Date.now() - 86_400_000).toISOString()
    signInAs('u-bao')
    const { wrapper } = createTestWrapper()
    render(<EventProgressTab clubId="c-guitar" eventId="e-winter" />, { wrapper })
    const overall = await screen.findByRole('region', { name: 'Tiến độ chung' })
    expect(within(overall).getByText('Toàn sự kiện')).toBeInTheDocument()
    const logistics = screen.getByRole('heading', { name: 'Tiểu ban Hậu cần' }).closest('li')
    if (!logistics) throw new Error('Thiếu thẻ Hậu cần')
    expect(within(logistics).getByText(/việc hoàn thành · \d+ quá hạn$/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('says so when the event has no subcommittee', async () => {
    signInAs('u-anh')
    const { wrapper } = createTestWrapper()
    render(<EventProgressTab clubId="c-guitar" eventId="e-exchange" />, { wrapper })
    expect(await screen.findByText('Chưa có tiểu ban')).toBeInTheDocument()
  })
})
