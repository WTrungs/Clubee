import type { TaskChange, TaskChangeField } from '@/features/task/model/taskTypes'
import { newId } from './mockHttp'
import { personRef } from './mockMembers'
import { nowIso } from './mockTime'
import type { DbTask, DbTaskChange } from './seed/taskSeed'

const namesOf = (userIds: string[]) => userIds.map((userId) => personRef(userId).fullName)

/** Ghi một lần đổi người hoặc đổi hạn; người ghi dạng họ tên lúc đổi (BR-DATA-02). */
export function recordTaskChange(task: DbTask, input: { actorId: string; field: TaskChangeField; from: string[]; to: string[]; reason: string }): void {
  const people = input.field !== 'DUE_AT'
  task.changes.push({
    id: newId('tc'),
    at: nowIso(),
    actorId: input.actorId,
    actorName: personRef(input.actorId).fullName,
    field: input.field,
    from: people ? namesOf(input.from) : input.from,
    to: people ? namesOf(input.to) : input.to,
    reason: input.reason,
  })
}

export function toTaskChange(change: DbTaskChange): TaskChange {
  const base = { id: change.id, at: change.at, actor: { id: change.actorId, fullName: change.actorName }, reason: change.reason }
  if (change.field === 'DUE_AT') return { ...base, field: 'DUE_AT', fromDueAt: change.from[0] ?? '', toDueAt: change.to[0] ?? '' }
  return { ...base, field: change.field, fromPeople: change.from, toPeople: change.to }
}
