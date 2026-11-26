import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { scheduleConflictsOf } from '@/api/mocks/mockScheduleConflicts'
import { openTaskCountOf } from '@/api/mocks/mockScopes'
import type { DbSession } from '@/api/mocks/db'
import { eventRepository } from '@/features/event/model/eventRepository'
import { conflictText } from '@/features/event/viewModel/eventDisplay'
import { signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import { overloadWarning } from './overloadWarning'

const winter = () => {
  const event = db.events.find((candidate) => candidate.id === 'e-winter')
  if (!event) throw new Error('Thiếu e-winter')
  return event
}

/** Buổi toàn CLB không giới hạn chỗ: mọi thành viên Thử việc, Chính thức là đối tượng. */
function addSession(spec: Partial<DbSession> & Pick<DbSession, 'id' | 'title' | 'startAt' | 'endAt'>): void {
  db.sessions.push({
    clubId: 'c-guitar',
    departmentId: null,
    description: '',
    location: 'Phòng B2.04',
    capacity: null,
    registrationDeadline: null,
    createdBy: 'u-anh',
    createdAt: spec.startAt,
    seriesId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    version: 1,
    ...spec,
  })
}

describe('cảnh báo trùng lịch (FR-TASK-09)', () => {
  it('buổi chồng giờ thì có, chạm mốc thì không, buổi đã hủy thì không', () => {
    const event = winter()
    addSession({ id: 's-overlap', title: 'Tập dượt', startAt: event.startAt, endAt: event.endAt })
    addSession({ id: 's-touch', title: 'Họp trước', startAt: new Date(Date.parse(event.startAt) - 3_600_000).toISOString(), endAt: event.startAt })
    addSession({ id: 's-cancelled', title: 'Buổi đã hủy', startAt: event.startAt, endAt: event.endAt, cancelledAt: event.startAt })
    const conflicts = scheduleConflictsOf('u-thao', { startAt: event.startAt, endAt: event.endAt, excludeEventId: event.id }, 'c-guitar')
    expect(conflicts.map((conflict) => conflict.title)).toEqual(['Tập dượt'])
  })

  it('hoạt động ở CLB khác chỉ ghi loại và giờ, không lộ tên', () => {
    const event = winter()
    addSession({ id: 's-english', clubId: 'c-english', title: 'Speaking club', startAt: event.startAt, endAt: event.endAt })
    const conflicts = scheduleConflictsOf('u-tu', { startAt: event.startAt, endAt: event.endAt, excludeEventId: event.id }, 'c-guitar')
    expect(conflicts).toEqual([{ kind: 'SESSION', title: null, startAt: event.startAt, endAt: event.endAt }])
    expect(conflictText(conflicts[0] ?? { kind: 'SESSION', title: null, startAt: event.startAt, endAt: event.endAt })).toMatch(/^Buổi sinh hoạt ở CLB khác \(/)
  })

  it('ứng viên mời vào tiểu ban kèm hoạt động chồng giờ', async () => {
    const event = winter()
    addSession({ id: 's-overlap', title: 'Tập dượt', startAt: event.startAt, endAt: event.endAt })
    signInAs('u-bao')
    const candidates = await eventRepository.staffCandidates('c-guitar', 'e-winter', 'Thảo')
    expect(candidates.find((candidate) => candidate.id === 'u-thao')?.conflicts.map(conflictText)).toEqual([expect.stringMatching(/^Buổi sinh hoạt Tập dượt \(/)])
  })
})

describe('cảnh báo quá tải (FR-TASK-09)', () => {
  it('phạm vi giao việc trả số việc đang làm của từng người và ngưỡng của CLB', async () => {
    signInAs('u-anh')
    const scopes = await taskRepository.assignableScopes('c-guitar')
    const scope = scopes[0]
    expect(scope?.overloadThreshold).toBe(5)
    const member = scope?.members[0]
    expect(member?.openTaskCount).toBe(openTaskCountOf(member?.id ?? '', 'c-guitar'))
  })

  it('chỉ đếm việc đang làm chính còn hiệu lực; vượt ngưỡng khi giao thêm thì cảnh báo', () => {
    const before = openTaskCountOf('u-thao', 'c-guitar')
    const template = db.tasks[0]
    if (!template) throw new Error('Thiếu việc mẫu')
    for (const [index, status] of (['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW', 'DONE', 'CANCELLED'] as const).entries()) {
      db.tasks.push({ ...template, id: `t-load-${index}`, clubId: 'c-guitar', scopeType: 'DEPARTMENT', scopeId: 'd-music', ownerId: 'u-thao', status })
    }
    expect(openTaskCountOf('u-thao', 'c-guitar')).toBe(before + 3)
    expect(overloadWarning({ fullName: 'Thảo', openTaskCount: 4 }, 5)).toBeNull()
    expect(overloadWarning({ fullName: 'Thảo', openTaskCount: 5 }, 5)).toBe('Thảo đang làm 5 việc; giao thêm sẽ vượt ngưỡng 5 việc của CLB. Bạn vẫn giao được.')
    expect(overloadWarning(null, 5)).toBeNull()
  })
})
