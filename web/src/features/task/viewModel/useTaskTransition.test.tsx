import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { server } from '@/api/mocks/server'
import { ApiError } from '@/api/apiError'
import { createTestWrapper, signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import { taskQueryKeys } from './taskQueryKeys'
import { useTaskTransition } from './useTaskTransition'
import { viewerRoleOf } from './useTaskDetailViewModel'

const seedTask = (id: string) => {
  const task = db.tasks.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`missing seed task ${id}`)
  return { id: task.id, clubId: task.clubId, version: task.version, title: task.title }
}

describe('useTaskTransition', () => {
  it('starts a task right away without touching cached lists before the server confirms (NFR-REL-04)', async () => {
    signInAs('u-ha')
    const { wrapper, queryClient } = createTestWrapper()
    const { result } = renderHook(() => useTaskTransition(), { wrapper })
    const task = seedTask('t-intro-post')
    const listKey = taskQueryKeys.mine({ status: ['ASSIGNED'] })
    queryClient.setQueryData(listKey, { content: [{ id: task.id, status: 'ASSIGNED' }], page: 0, size: 20, totalElements: 1, totalPages: 1 })

    // Giữ request tới khi thấy trạng thái chờ, để test không phụ thuộc tốc độ máy.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/clubs/:clubId/tasks/:taskId/transitions', async () => {
        await gate
      }),
    )
    act(() => result.current.requestAction(task, 'START'))
    expect(result.current.dialog).toBeNull()
    await waitFor(() => expect(result.current.pendingTaskId).toBe('t-intro-post'))
    release()

    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(db.tasks.find((candidate) => candidate.id === 't-intro-post')?.status).toBe('IN_PROGRESS')
    expect(queryClient.getQueryData<{ status: string }>(taskQueryKeys.detail('c-guitar', 't-intro-post'))?.status).toBe('IN_PROGRESS')
    // Lists are never edited locally: they are only invalidated and refetched from the server.
    expect(queryClient.getQueryData<{ content: Array<{ status: string }> }>(listKey)?.content[0]?.status).toBe('ASSIGNED')
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('opens a dialog for actions that need input, then submits with the note', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useTaskTransition(), { wrapper })
    const task = seedTask('t-poster')

    act(() => result.current.requestAction(task, 'SUBMIT'))
    expect(result.current.dialog?.action).toBe('SUBMIT')
    act(() => result.current.confirmDialog({ note: 'Đã xong bản A3 và bản fanpage.' }))

    await waitFor(() => expect(result.current.dialog).toBeNull())
    const stored = db.tasks.find((candidate) => candidate.id === 't-poster')
    expect(stored?.status).toBe('PENDING_REVIEW')
    expect(stored?.submission?.note).toBe('Đã xong bản A3 và bản fanpage.')
  })

  it('raises the conflict banner when the task changed meanwhile (409)', async () => {
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useTaskTransition(), { wrapper })
    const task = seedTask('t-intro-post')
    const stored = db.tasks.find((candidate) => candidate.id === 't-intro-post')
    if (stored) stored.version += 1

    act(() => result.current.requestAction(task, 'START'))
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(stored?.status).toBe('ASSIGNED')
  })

  it('reloads the task and lists when the server refuses (422), so buttons match the new state', async () => {
    signInAs('u-ha')
    const { wrapper, queryClient } = createTestWrapper()
    const { result } = renderHook(() => useTaskTransition(), { wrapper })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    act(() => result.current.requestAction(seedTask('t-photo-oct'), 'START'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.detail('c-guitar', 't-photo-oct') }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.lists })
    expect(result.current.conflict).toBe(false)
  })
})

describe('task rules enforced by the mock server', () => {
  it('lets only the owner submit; a collaborator gets the reason', async () => {
    signInAs('u-vy')
    const task = seedTask('t-poster')
    expect((await taskRepository.get(task.clubId, task.id)).allowedActions).toEqual([])
    const error = await taskRepository.transition(task.clubId, task.id, { action: 'SUBMIT', version: task.version, note: 'x' }).catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).detail).toBe('Chỉ người chính được cập nhật và nộp kết quả.')
  })

  it('requires a comment when the assigner sends a task back', async () => {
    signInAs('u-linh')
    const task = seedTask('t-cover')
    const missing = await taskRepository.transition(task.clubId, task.id, { action: 'REQUEST_CHANGES', version: task.version }).catch((caught: unknown) => caught)
    expect((missing as ApiError).status).toBe(400)
    const updated = await taskRepository.transition(task.clubId, task.id, { action: 'REQUEST_CHANGES', version: task.version, reason: 'Chữ hơi nhỏ, tăng cỡ chữ.' })
    expect(updated.status).toBe('IN_PROGRESS')
    expect(updated.reviewComment).toBe('Chữ hơi nhỏ, tăng cỡ chữ.')
  })

  it('rejects a transition that is not in ST-TASK (422)', async () => {
    signInAs('u-ha')
    const task = seedTask('t-photo-oct')
    const error = await taskRepository.transition(task.clubId, task.id, { action: 'START', version: task.version }).catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(422)
  })

  it.each([
    ['CLOSED', 'Sự kiện đã đóng nên công việc chỉ xem được.'],
    ['CANCELLED', 'Sự kiện đã hủy nên công việc chỉ xem được.'],
  ] as const)('locks subcommittee tasks once the event is %s (FR-EVT-16)', async (status, reason) => {
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (event) event.status = status
    signInAs('u-ha')
    const task = seedTask('t-invite')

    const detail = await taskRepository.get(task.clubId, task.id)
    expect(detail.allowedActions).toEqual([])
    expect(detail.readOnlyReason).toBe(reason)
    const error = await taskRepository.transition(task.clubId, task.id, { action: 'START', version: task.version }).catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).code).toBe('EVENT_READ_ONLY')
    expect((error as ApiError).detail).toBe(reason)
    expect(db.tasks.find((candidate) => candidate.id === 't-invite')?.status).toBe('ASSIGNED')
  })

  it('keeps subcommittee tasks open while the event has only ended', async () => {
    const event = db.events.find((candidate) => candidate.id === 'e-winter')
    if (event) event.status = 'ENDED'
    signInAs('u-ha')
    const task = seedTask('t-invite')

    const detail = await taskRepository.get(task.clubId, task.id)
    expect(detail.allowedActions).toEqual(['START'])
    expect(detail.readOnlyReason).toBeNull()
    expect((await taskRepository.transition(task.clubId, task.id, { action: 'START', version: task.version })).status).toBe('IN_PROGRESS')
  })

  it('only offers scopes the user manages when assigning (BR-TASK-01)', async () => {
    signInAs('u-linh')
    const scopes = await taskRepository.assignableScopes('c-guitar')
    // Head of the media department and lead of the event's media subcommittee, nothing else.
    expect(scopes.map((scope) => scope.id)).toEqual(['d-media', 'sc-winter-media'])
    expect(scopes[0]?.members.map((member) => member.id)).not.toContain('u-yen')
    expect(scopes[1]?.members.map((member) => member.id).sort()).toEqual(['u-ha', 'u-linh', 'u-vy'])
  })
})

describe('viewerRoleOf', () => {
  const task = { owner: { id: 'a', fullName: 'A' }, assigner: { id: 'b', fullName: 'B' }, collaborators: [{ id: 'c', fullName: 'C' }] }
  it('names the viewer relation to the task', () => {
    expect(viewerRoleOf(task, 'a')).toBe('owner')
    expect(viewerRoleOf(task, 'b')).toBe('assigner')
    expect(viewerRoleOf(task, 'c')).toBe('collaborator')
    expect(viewerRoleOf(task, 'z')).toBe('viewer')
  })
})
