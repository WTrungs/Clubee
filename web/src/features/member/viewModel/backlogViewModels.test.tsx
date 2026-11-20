import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { API, problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { BacklogItem } from '../model/backlogTypes'
import { memberRepository } from '../model/memberRepository'
import { useBacklogViewModel } from './useBacklogViewModel'
import { useResolveBacklogViewModel } from './useResolveBacklogViewModel'

/** Chủ nhiệm u-anh đưa u-long ra khỏi CLB để có 4 mục tồn đọng. */
async function removeLong(): Promise<BacklogItem[]> {
  signInAs('u-anh')
  const id = 'm-guitar-long'
  const version = db.memberships.find((membership) => membership.id === id)?.version ?? 0
  await memberRepository.transition('c-guitar', id, { action: 'REMOVE', reason: 'Vi phạm nội quy nhiều lần.', version })
  return (await memberRepository.backlog('c-guitar', { status: 'OPEN' })).content
}

async function clubWrapper() {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper()
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('useBacklogViewModel (FR-MEM-09)', () => {
  it('groups open items by former member and filters by the person from the URL', async () => {
    await removeLong()
    const wrapper = await clubWrapper()
    const clearFormer = vi.fn()
    const { result } = renderHook(() => useBacklogViewModel('u-long', clearFormer), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.formerName).toBe(result.current.groups[0]?.person.fullName)
    expect(result.current.groups[0]?.items).toHaveLength(4)
    act(() => result.current.clearFormer())
    expect(clearFormer).toHaveBeenCalled()
  })

  it('keeps naming the former member when the filter leaves nothing to show', async () => {
    await removeLong()
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useBacklogViewModel('u-long', () => {}), { wrapper })
    await waitFor(() => expect(result.current.formerName).toBe('Bùi Đức Long'))
    act(() => result.current.setStatus('RESOLVED'))
    await waitFor(() => expect(result.current.empty).toBe(true))
    expect(result.current.formerName).toBe('Bùi Đức Long')
  })
})

describe('useResolveBacklogViewModel (FR-MEM-09, NFR-REL-01, NFR-REL-03)', () => {
  it('sends the chosen candidate and closes on success', async () => {
    const items = await removeLong()
    const task = items.find((item) => item.kind === 'TASK')
    if (!task) throw new Error('Thiếu mục việc')
    const wrapper = await clubWrapper()
    const onDone = vi.fn()
    const { result } = renderHook(() => useResolveBacklogViewModel(task, 'REASSIGN', onDone), { wrapper })
    await waitFor(() => expect(result.current.candidatesLoading).toBe(false))
    const tram = result.current.candidates.find((candidate) => candidate.id === 'u-tram')
    if (!tram) throw new Error('Thiếu ứng viên')
    expect(result.current.canSubmit).toBe(false)
    act(() => result.current.select(tram))
    act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(db.tasks.find((candidate) => candidate.id === 't-sound')?.ownerId).toBe('u-tram')
  })

  it('shows the field reason from the server and reports a conflict on 409 without closing', async () => {
    const items = await removeLong()
    const position = items.find((item) => item.kind === 'POSITION')
    if (!position) throw new Error('Thiếu mục chức vụ')
    const wrapper = await clubWrapper()
    const onDone = vi.fn()
    server.use(
      http.post(`${API}/clubs/:clubId/backlog-items/:itemId/resolution`, () =>
        problem(400, 'Người được chọn không hợp lệ.', 'VALIDATION', [{ field: 'userId', message: 'Lý do từ máy chủ.' }]),
      ),
    )
    const { result } = renderHook(() => useResolveBacklogViewModel(position, 'APPOINT', onDone), { wrapper })
    act(() => result.current.select({ id: 'u-khoa', fullName: 'Khoa' }))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toBe('Lý do từ máy chủ.'))

    server.use(http.post(`${API}/clubs/:clubId/backlog-items/:itemId/resolution`, () => problem(409, 'Mục vừa được xử lý.', 'VERSION_CONFLICT')))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.canSubmit).toBe(false)
    expect(onDone).not.toHaveBeenCalled()
  })
})
