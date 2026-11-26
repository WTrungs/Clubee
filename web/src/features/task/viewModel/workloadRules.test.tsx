import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { toVnIso } from '@/api/mocks/mockTime'
import { createTestWrapper, signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import type { WorkloadRow } from '../model/taskTypes'
import { useWorkloadViewModel, workloadSummary } from './useWorkloadViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const scopesOf = async (userId: string) => {
  signInAs(userId)
  return (await taskRepository.workloadScopes('c-guitar')).map((scope) => `${scope.type}:${scope.id ?? ''}`)
}
const rowOf = (rows: WorkloadRow[], userId: string) => rows.find((row) => row.person.id === userId)
const task = (id: string) => {
  const found = db.tasks.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Thiếu ${id}`)
  return found
}

describe('phạm vi xem khối lượng việc (FR-TASK-08)', () => {
  it('ban chủ nhiệm xem toàn CLB, mọi ban, mọi sự kiện còn hoạt động; trưởng, phó ban xem ban mình; Trưởng BTC xem sự kiện mình', async () => {
    const board = await scopesOf('u-anh')
    expect(board[0]).toBe('CLUB:')
    expect(board).toEqual(expect.arrayContaining(['DEPARTMENT:d-media', 'DEPARTMENT:d-logistics', 'EVENT:e-winter']))
    expect(board).not.toContain('DEPARTMENT:d-photo')
    expect(await scopesOf('u-linh')).toEqual(['DEPARTMENT:d-media'])
    expect(await scopesOf('u-bao')).toEqual(['EVENT:e-winter'])
    expect(await scopesOf('u-thao')).toEqual([])
    signInAs('u-anh')
    expect((await (await import('@/features/club/model/clubRepository')).clubRepository.getClub('c-guitar')).allowedActions).toContain('VIEW_WORKLOAD')
    signInAs('u-thao')
    expect((await (await import('@/features/club/model/clubRepository')).clubRepository.getClub('c-guitar')).allowedActions).not.toContain('VIEW_WORKLOAD')
  })

  it('kiểm tham số và quyền theo phạm vi', async () => {
    signInAs('u-thao')
    expect(await fail(taskRepository.workload('c-guitar', { type: 'CLUB', id: null }))).toMatchObject({ status: 403 })
    signInAs('u-linh')
    expect(await fail(taskRepository.workload('c-guitar', { type: 'CLUB', id: null }))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await fail(taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-logistics' }))).toMatchObject({ status: 403 })
    expect(await fail(taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-khong-co' }))).toMatchObject({ status: 404, code: 'SCOPE_NOT_FOUND' })
    expect(await fail(taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: null }))).toMatchObject({ status: 400 })
  })
})

describe('đếm việc theo người (FR-TASK-08)', () => {
  it('đếm việc làm chính còn mở, quá hạn và phối hợp; việc đã xong, đã hủy không tính', async () => {
    signInAs('u-linh')
    const before = await taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-media' })
    const poster = task('t-poster')
    const owner = poster.ownerId
    const ownerBefore = rowOf(before.rows, owner)
    if (!ownerBefore) throw new Error('Thiếu người làm t-poster')

    poster.dueAt = toVnIso(Date.now() - 60 * 60 * 1000)
    const after = await taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-media' })
    expect(rowOf(after.rows, owner)).toMatchObject({ open: ownerBefore.open, overdue: ownerBefore.overdue + 1 })

    poster.status = 'DONE'
    const done = await taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-media' })
    expect(rowOf(done.rows, owner)?.open).toBe(ownerBefore.open - 1)
  })

  it('liệt kê cả người chưa có việc, người tạm nghỉ, và người ngoài phạm vi còn giữ việc', async () => {
    signInAs('u-anh')
    const club = await taskRepository.workload('c-guitar', { type: 'CLUB', id: null })
    expect(club.rows.some((row) => row.open === 0)).toBe(true)
    const members = db.memberships.filter((membership) => membership.clubId === 'c-guitar' && ['PROBATION', 'ACTIVE', 'ON_LEAVE'].includes(membership.status))
    for (const membership of members) expect(rowOf(club.rows, membership.userId)).toBeDefined()
    const onLeave = members.find((membership) => membership.status === 'ON_LEAVE')
    if (onLeave) expect(rowOf(club.rows, onLeave.userId)?.onLeave).toBe(true)

    // Người phối hợp ở ban khác vẫn hiện ở bảng của ban, kèm ghi chú.
    const poster = task('t-poster')
    poster.collaboratorIds = [...poster.collaboratorIds, 'u-thao']
    const media = await taskRepository.workload('c-guitar', { type: 'DEPARTMENT', id: 'd-media' })
    expect(rowOf(media.rows, 'u-thao')).toMatchObject({ open: 0, collaborating: 1, detail: expect.stringContaining('Nay thuộc ban') })
  })

  it('sự kiện: Trưởng BTC đứng đầu danh sách nhân sự, ghi tiểu ban; việc của sự kiện đã đóng không tính', async () => {
    signInAs('u-bao')
    const winter = await taskRepository.workload('c-guitar', { type: 'EVENT', id: 'e-winter' })
    expect(rowOf(winter.rows, 'u-bao')?.detail).toBe('Trưởng BTC')
    expect(winter.rows.filter((row) => row.detail?.startsWith('Tiểu ban')).length).toBeGreaterThan(0)
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (!event) throw new Error('Thiếu e-winter')
    event.status = 'CLOSED'
    signInAs('u-anh')
    expect((await taskRepository.workloadScopes('c-guitar')).some((scope) => scope.id === 'e-winter')).toBe(false)
  })
})

describe('useWorkloadViewModel', () => {
  it('chọn phạm vi đầu tiên, đổi phạm vi thì tải bảng mới', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useWorkloadViewModel('c-guitar', true), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    expect(result.current.scopeKey).toBe('CLUB')
    act(() => result.current.setScopeKey('DEPARTMENT:d-media'))
    await waitFor(() => expect(result.current.scopeName).toBe('Ban Truyền thông'))
    await waitFor(() => expect(result.current.stale).toBe(false))
    const media = db.memberships.filter((membership) => membership.clubId === 'c-guitar' && membership.departmentId === 'd-media' && membership.status !== 'LEFT' && membership.status !== 'PENDING')
    expect(result.current.rows.length).toBeGreaterThanOrEqual(media.length)
  })

  it('cộng tổng đang làm, quá hạn và số người có việc quá hạn', () => {
    const row = (open: number, overdue: number): WorkloadRow => ({ person: { id: crypto.randomUUID(), fullName: 'A' }, detail: null, onLeave: false, open, overdue, collaborating: 0 })
    expect(workloadSummary([row(3, 1), row(2, 0), row(1, 1)])).toEqual({ open: 6, overdue: 2, peopleOverdue: 2 })
  })
})
