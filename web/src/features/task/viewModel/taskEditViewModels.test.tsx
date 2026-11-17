import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sessionQueryKey } from '@/api/queryClient'
import { db } from '@/api/mocks/db'
import { accountRepository } from '@/features/account/model/accountRepository'
import { formatDate } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import type { TaskDetail } from '../model/taskTypes'
import { TaskDetailSheet } from '../view/TaskDetailSheet'
import { changeDueSchema, reassignChanged, reassignDefaults } from './taskEditSchemas'
import { taskQueryKeys } from './taskQueryKeys'
import { useTaskEditViewModel } from './useTaskEditViewModel'
import { useTaskTransition } from './useTaskTransition'

// Menu Radix đo kích thước bằng ResizeObserver, jsdom không có.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

const stored = (id: string) => {
  const task = db.tasks.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Thiếu việc ${id}`)
  return task
}
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

async function setup(userId: string, taskId: string) {
  signInAs(userId)
  const task = await taskRepository.get('c-guitar', taskId)
  const { wrapper, queryClient } = createTestWrapper()
  return { task, wrapper, queryClient }
}

describe('task edit schemas (FR-TASK-05)', () => {
  it('needs a future due date and a reason, and knows when nothing changed', () => {
    const past = changeDueSchema.safeParse({ dueDate: formatDate(inDays(-1)), dueTime: '09:00', reason: 'Đổi hạn.' })
    expect(past.success ? [] : past.error.issues.map((issue) => issue.path.join('.'))).toEqual(['dueDate'])
    const short = changeDueSchema.safeParse({ dueDate: formatDate(inDays(3)), dueTime: '09:00', reason: 'Gấp' })
    expect(short.success ? [] : short.error.issues.map((issue) => issue.path.join('.'))).toEqual(['reason'])
    const task = { owner: { id: 'a', fullName: 'A' }, collaborators: [{ id: 'b', fullName: 'B' }] }
    expect(reassignDefaults(task)).toEqual({ ownerId: 'a', collaboratorIds: ['b'], reason: '' })
    expect(reassignChanged(task, { ownerId: 'a', collaboratorIds: ['b'] })).toBe(false)
    expect(reassignChanged(task, { ownerId: 'a', collaboratorIds: [] })).toBe(true)
  })
})

describe('useTaskEditViewModel (FR-TASK-05, NFR-REL-03)', () => {
  it('saves a new due date and puts the server copy in the cache', async () => {
    const { task, wrapper, queryClient } = await setup('u-linh', 't-teaser')
    const { result } = renderHook(() => useTaskEditViewModel(task), { wrapper })
    act(() => result.current.open('due'))
    act(() => {
      result.current.dueForm.setValue('dueDate', formatDate(inDays(10)))
      result.current.dueForm.setValue('reason', 'Phòng tập bận tuần này.')
    })
    await act(() => result.current.submitDue())
    await waitFor(() => expect(result.current.mode).toBeNull())
    expect(stored('t-teaser').changes).toHaveLength(1)
    expect(queryClient.getQueryData<TaskDetail>(taskQueryKeys.detail('c-guitar', 't-teaser'))?.version).toBe(2)
  })

  it('drops the nothing-changed note once a real change is sent, so the server reason shows (IF-01)', async () => {
    const { task, wrapper } = await setup('u-linh', 't-teaser')
    const { result } = renderHook(() => useTaskEditViewModel(task), { wrapper })
    act(() => result.current.open('due'))
    act(() => result.current.dueForm.setValue('reason', 'Phòng tập bận tuần này.'))
    await act(() => result.current.submitDue())
    expect(result.current.errorMessage).toBe('Chưa có thay đổi nào so với hiện tại.')

    act(() => result.current.dueForm.setValue('dueDate', formatDate(inDays(10))))
    // Sửa ngày là câu báo tự ẩn, không phải chờ bấm lưu lại.
    expect(result.current.errorMessage).toBeNull()
    stored('t-teaser').status = 'DONE'
    await act(() => result.current.submitDue())
    await waitFor(() => expect(result.current.errorMessage).toBe('Việc đã Hoàn thành nên không sửa được nữa.'))
    expect(result.current.mode).toBe('due')
  })

  it('sends the version seen when the dialog opened, so a reload in between still meets 409', async () => {
    const { task, wrapper } = await setup('u-linh', 't-teaser')
    const { result, rerender } = renderHook(({ current }) => useTaskEditViewModel(current), { wrapper, initialProps: { current: task } })
    act(() => result.current.open('due'))
    act(() => {
      result.current.dueForm.setValue('dueDate', formatDate(inDays(10)))
      result.current.dueForm.setValue('reason', 'Phòng tập bận tuần này.')
    })
    // Người khác vừa sửa và sheet đã tải bản mới trong lúc hộp còn mở.
    stored('t-teaser').version += 1
    rerender({ current: { ...task, version: stored('t-teaser').version } })
    await act(() => result.current.submitDue())
    await waitFor(() => expect(result.current.mode).toBeNull())
    expect(stored('t-teaser').changes).toEqual([])
  })

  it('says nothing changed instead of sending, and shows a server field error on the right field', async () => {
    const { task, wrapper } = await setup('u-linh', 't-intro-post')
    const { result } = renderHook(() => useTaskEditViewModel(task), { wrapper })
    act(() => result.current.open('reassign'))
    await waitFor(() => expect(result.current.ownerOptions.length).toBeGreaterThan(1))
    act(() => result.current.reassignForm.setValue('reason', 'Đổi người làm.'))
    await act(() => result.current.submitReassign())
    expect(result.current.errorMessage).toBe('Chưa có thay đổi nào so với hiện tại.')

    act(() => result.current.selectOwner('u-vy'))
    // Vy vừa tạm nghỉ sau khi danh sách đã tải.
    const vy = db.memberships.find((membership) => membership.clubId === 'c-guitar' && membership.userId === 'u-vy')
    if (vy) vy.status = 'ON_LEAVE'
    await act(() => result.current.submitReassign())
    await waitFor(() => expect(result.current.reassignForm.getFieldState('ownerId').error?.message).toBe('Người chính phải là thành viên đang hoạt động của phạm vi việc.'))
    expect(result.current.mode).toBe('reassign')
    expect(stored('t-intro-post').ownerId).toBe('u-ha')
  })

  it('keeps the dialog open with the reason on 403, and closes and reloads on 409', async () => {
    const { task, wrapper, queryClient } = await setup('u-linh', 't-intro-post')
    const { result } = renderHook(() => useTaskEditViewModel(task), { wrapper })
    act(() => result.current.open('reassign'))
    await waitFor(() => expect(result.current.ownerOptions.length).toBeGreaterThan(1))
    act(() => {
      result.current.selectOwner('u-vy')
      result.current.reassignForm.setValue('reason', 'Hà đang làm poster.')
    })
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'DEPARTMENT_HEAD', permission: 'ASSIGN_TASK', enabled: false, updatedBy: 'u-anh', updatedAt: '2026-11-16T10:00:00+07:00' })
    await act(() => result.current.submitReassign())
    await waitFor(() => expect(result.current.errorMessage).toMatch(/^Chỉ .+ được đổi người làm việc trong phạm vi này\.$/))
    expect(result.current.mode).toBe('reassign')
    db.permissionOverrides.length = 0

    act(() => result.current.close())
    act(() => result.current.open('due'))
    act(() => {
      result.current.dueForm.setValue('dueDate', formatDate(inDays(10)))
      result.current.dueForm.setValue('reason', 'Đổi hạn cho kịp in.')
    })
    stored('t-intro-post').version += 1
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await act(() => result.current.submitDue())
    await waitFor(() => expect(result.current.mode).toBeNull())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.detail('c-guitar', 't-intro-post') })
    expect(stored('t-intro-post').changes).toEqual([])
  })
})

describe('TaskDetailSheet menu (FR-TASK-05)', () => {
  function Host({ taskId }: { taskId: string }) {
    const transition = useTaskTransition()
    return <TaskDetailSheet selection={{ clubId: 'c-guitar', taskId }} onClose={() => {}} transition={transition} />
  }

  async function renderSheet(userId: string, taskId: string) {
    signInAs(userId)
    const { wrapper: Base, queryClient } = createTestWrapper()
    queryClient.setQueryData(sessionQueryKey, await accountRepository.getMe())
    const wrapper = ({ children }: { children: ReactNode }) => <Base>{children}</Base>
    return render(<Host taskId={taskId} />, { wrapper })
  }

  it('gives the assigner a menu to reassign, change the due date or cancel, kept out of the footer', async () => {
    const user = userEvent.setup()
    await renderSheet('u-linh', 't-cover')
    const sheet = await screen.findByRole('dialog', { name: 'Cập nhật ảnh bìa fanpage' })
    expect(within(sheet).getByRole('button', { name: 'Nghiệm thu đạt' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Hủy việc' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Thao tác khác' }))
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Đổi người làm', 'Đổi hạn', 'Hủy việc'])
    await user.click(screen.getByRole('menuitem', { name: 'Đổi hạn' }))
    const dialog = await screen.findByRole('dialog', { name: 'Đổi hạn' })
    expect(within(dialog).getByRole('textbox', { name: 'Hạn mới' })).toHaveValue(formatDate(stored('t-cover').dueAt))
  })

  it('shows no menu to a collaborator', async () => {
    await renderSheet('u-vy', 't-poster')
    const sheet = await screen.findByRole('dialog', { name: 'Thiết kế poster Đêm nhạc Mùa đông' })
    expect(within(sheet).queryByRole('button', { name: 'Thao tác khác' })).not.toBeInTheDocument()
  })

  it('shows the cancel reason and the change history', async () => {
    const { changes } = stored('t-old-banner')
    changes.push({ id: 'tc-1', at: '2026-11-01T09:00:00+07:00', actorId: 'u-linh', actorName: 'Đặng Khánh Linh', field: 'OWNER', from: ['Lê Thu Hà'], to: ['Hoàng Thảo Vy'], reason: 'Hà bận thi.' })
    await renderSheet('u-linh', 't-old-banner')
    const sheet = await screen.findByRole('dialog', { name: 'In lại băng rôn khai giảng' })
    expect(within(sheet).getByRole('heading', { name: 'Lý do hủy' })).toBeInTheDocument()
    expect(within(sheet).getAllByText('Thay đổi kế hoạch, không cần làm nữa.').length).toBeGreaterThan(0)
    expect(within(sheet).getByText('đổi người chính từ Lê Thu Hà thành Hoàng Thảo Vy', { exact: false })).toBeInTheDocument()
    expect(within(sheet).getByText('Lý do: Hà bận thi.')).toBeInTheDocument()
  })
})
