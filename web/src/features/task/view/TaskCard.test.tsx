import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TaskSummary } from '../model/taskTypes'
import { TaskCard } from './TaskCard'

const task = (changes: Partial<TaskSummary>): TaskSummary => ({
  id: 't-1',
  clubId: 'c-guitar',
  clubName: 'CLB Guitar Sinh viên',
  title: 'Viết bài giới thiệu',
  scope: { type: 'DEPARTMENT', id: 'd-media', name: 'Ban Truyền thông', eventId: null, eventName: null },
  assigner: { id: 'u-linh', fullName: 'Đặng Khánh Linh' },
  owner: { id: 'u-ha', fullName: 'Lê Thu Hà' },
  collaborators: [],
  dueAt: '2026-11-18T21:00:00+07:00',
  priority: 'MEDIUM',
  status: 'ASSIGNED',
  overdue: false,
  dueSoon: false,
  allowedActions: [],
  version: 1,
  ...changes,
})

describe('TaskCard due flags (FR-TASK-06)', () => {
  it('shows the due-soon badge only when the server says so', () => {
    const { rerender } = render(<TaskCard task={task({ dueSoon: true })} showClub={false} onOpen={() => {}} onAction={() => {}} />)
    expect(screen.getByText('Sắp đến hạn')).toBeInTheDocument()
    rerender(<TaskCard task={task({ dueSoon: false })} showClub={false} onOpen={() => {}} onAction={() => {}} />)
    expect(screen.queryByText('Sắp đến hạn')).not.toBeInTheDocument()
  })

  it('tells screen readers a task is overdue', () => {
    render(<TaskCard task={task({ overdue: true, dueAt: '2026-11-10T21:00:00+07:00' })} showClub={false} onOpen={() => {}} onAction={() => {}} />)
    expect(screen.getByText('(quá hạn)')).toBeInTheDocument()
  })

  it('shows only the date, not overdue, when the due date passed but the server does not flag it (closed event)', () => {
    const pastDue = '2026-01-10T21:00:00+07:00'
    render(<TaskCard task={task({ overdue: false, dueAt: pastDue, status: 'IN_PROGRESS' })} showClub={false} onOpen={() => {}} onAction={() => {}} />)
    expect(screen.getByText('10/01/2026 21:00')).toBeInTheDocument()
    expect(screen.queryByText(/Quá hạn/)).not.toBeInTheDocument()
    expect(screen.queryByText('(quá hạn)')).not.toBeInTheDocument()
  })
})
