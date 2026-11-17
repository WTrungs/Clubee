import { describe, expect, it } from 'vitest'
import type { TaskChange, TaskSummary } from '../model/taskTypes'
import { changeText, footerActions, getDropTargets, groupByStatus, historyActionText, menuActions, overdueSummary, taskTimeline, transitionActions } from './taskDisplay'

describe('historyActionText', () => {
  it('tells assigning, moving and cancelling apart', () => {
    expect(historyActionText({ fromStatus: null, toStatus: 'ASSIGNED' })).toBe('giao việc')
    expect(historyActionText({ fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS' })).toBe('chuyển Mới giao → Đang làm')
    expect(historyActionText({ fromStatus: 'PENDING_REVIEW', toStatus: 'CANCELLED' })).toBe('hủy việc')
  })
})

describe('task changes (FR-TASK-05)', () => {
  const actor = { id: 'u-linh', fullName: 'Đặng Thùy Linh' }
  const due: TaskChange = { id: 'c1', at: '2026-11-16T10:00:00+07:00', actor, reason: 'Chờ in thử', field: 'DUE_AT', fromDueAt: '2026-11-18T21:00:00+07:00', toDueAt: '2026-11-20T09:30:00+07:00' }
  const owner: TaskChange = { id: 'c2', at: '2026-11-16T11:00:00+07:00', actor, reason: 'Hà bận thi', field: 'OWNER', fromPeople: ['Lê Thu Hà'], toPeople: ['Võ Tường Vy'] }
  const nobody: TaskChange = { id: 'c3', at: '2026-11-16T12:00:00+07:00', actor, reason: 'Gọn nhóm', field: 'COLLABORATORS', fromPeople: ['A', 'B'], toPeople: [] }

  it('says what changed from what to what', () => {
    expect(changeText(due)).toBe('đổi hạn từ 18/11/2026 21:00 thành 20/11/2026 09:30')
    expect(changeText(owner)).toBe('đổi người chính từ Lê Thu Hà thành Võ Tường Vy')
    expect(changeText(nobody)).toBe('đổi người phối hợp từ A, B thành không có ai')
    expect(changeText({ ...owner, field: 'ASSIGNER' })).toBe('đổi người nghiệm thu từ Lê Thu Hà thành Võ Tường Vy')
  })

  it('merges status history, changes and overdue marks, newest first, with the reason as note', () => {
    const history = [{ id: 'h1', at: '2026-11-16T10:30:00+07:00', actor, fromStatus: 'ASSIGNED' as const, toStatus: 'IN_PROGRESS' as const, note: null }]
    const overdueHistory = [{ dueAt: '2026-11-15T21:00:00+07:00', flaggedAt: '2026-11-16T09:00:00+07:00' }]
    expect(taskTimeline({ history, changes: [owner, due], overdueHistory }).map((entry) => [entry.id, entry.actor?.id ?? null, entry.note])).toEqual([
      ['c2', 'u-linh', 'Lý do: Hà bận thi'],
      ['h1', 'u-linh', null],
      ['c1', 'u-linh', 'Lý do: Chờ in thử'],
      ['overdue-2026-11-15T21:00:00+07:00', null, null],
    ])
    expect(taskTimeline({ history: [], changes: [], overdueHistory })[0]?.text).toBe('ghi nhận quá hạn (hạn 15/11/2026 21:00)')
    expect([overdueSummary(0), overdueSummary(2)]).toEqual([null, 'Từng quá hạn 2 lần; đổi hạn không xóa các mốc này.'])
  })

  it('keeps cancel out of the footer and puts it in the menu after reassign and due', () => {
    const task = { allowedActions: ['CANCEL', 'APPROVE', 'CHANGE_DUE', 'REASSIGN', 'REQUEST_CHANGES'] as TaskSummary['allowedActions'] }
    expect(footerActions(task)).toEqual(['APPROVE', 'REQUEST_CHANGES'])
    expect(menuActions(task)).toEqual(['REASSIGN', 'CHANGE_DUE', 'CANCEL'])
    expect(transitionActions(task)).toEqual(['CANCEL', 'APPROVE', 'REQUEST_CHANGES'])
  })
})

describe('getDropTargets', () => {
  it('maps each allowed transition to its target column', () => {
    expect([...getDropTargets({ status: 'ASSIGNED', allowedActions: ['START'] })]).toEqual([['IN_PROGRESS', 'START']])
    expect([...getDropTargets({ status: 'IN_PROGRESS', allowedActions: ['SUBMIT'] })]).toEqual([['PENDING_REVIEW', 'SUBMIT']])
    expect([...getDropTargets({ status: 'PENDING_REVIEW', allowedActions: ['APPROVE', 'REQUEST_CHANGES'] })]).toEqual([
      ['DONE', 'APPROVE'],
      ['IN_PROGRESS', 'REQUEST_CHANGES'],
    ])
  })

  it('gives no target when the server allows nothing (e.g. collaborator or finished task)', () => {
    expect(getDropTargets({ status: 'IN_PROGRESS', allowedActions: [] }).size).toBe(0)
    expect(getDropTargets({ status: 'DONE', allowedActions: [] }).size).toBe(0)
  })

  it('ignores an action that would keep the task in its current column', () => {
    expect(getDropTargets({ status: 'IN_PROGRESS', allowedActions: ['START'] }).size).toBe(0)
  })
})

describe('transitionActions', () => {
  it('keeps the server order', () => {
    expect(transitionActions({ allowedActions: ['REQUEST_CHANGES', 'APPROVE'] })).toEqual(['REQUEST_CHANGES', 'APPROVE'])
  })
})

describe('groupByStatus', () => {
  const make = (id: string, status: TaskSummary['status'], dueAt: string, overdue = false) => ({ id, status, dueAt, overdue })

  it('groups by status and puts overdue first, then the nearest due date', () => {
    const groups = groupByStatus([
      make('a', 'IN_PROGRESS', '2026-11-10T10:00:00+07:00'),
      make('b', 'IN_PROGRESS', '2026-11-05T10:00:00+07:00'),
      make('c', 'IN_PROGRESS', '2026-10-01T10:00:00+07:00', true),
      make('d', 'DONE', '2026-10-01T10:00:00+07:00'),
    ])
    expect(groups.IN_PROGRESS.map((task) => task.id)).toEqual(['c', 'b', 'a'])
    expect(groups.DONE.map((task) => task.id)).toEqual(['d'])
    expect(groups.ASSIGNED).toEqual([])
  })
})
