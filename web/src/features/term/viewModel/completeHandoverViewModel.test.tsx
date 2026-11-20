import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { API, problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import type { Handover } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'
import { useCompleteHandoverViewModel } from './useCompleteHandoverViewModel'

/** Ban chủ nhiệm u-anh mở bàn giao và ghi Chủ nhiệm mới; danh mục còn mục chờ nên chưa hoàn tất được. */
async function openHandover(): Promise<Handover> {
  signInAs('u-anh')
  const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
  const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
  return termRepository.saveAppointments('c-guitar', started.id, { appointments: [{ role: 'PRESIDENT', departmentId: null, userId: 'u-linh' }], version: started.version })
}

async function renderComplete(handover: Handover, onClose = () => {}) {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(`/clubs/c-guitar/handovers/${handover.id}`)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  return renderHook(() => ({ vm: useCompleteHandoverViewModel(handover, onClose), location: useLocation() }), { wrapper })
}

describe('useCompleteHandoverViewModel (FR-TERM-06, NFR-REL-01, NFR-REL-03)', () => {
  it('cannot submit while the handover still has blockers', async () => {
    const handover = await openHandover()
    const { result } = await renderComplete(handover)
    expect(result.current.vm.blockers.some((blocker) => /^Còn \d+ mục bàn giao chờ/.test(blocker))).toBe(true)
    expect(result.current.vm.canSubmit).toBe(false)
  })

  it('shows the reasons the server returns with 422 and stops offering the button', async () => {
    const handover = await openHandover()
    server.use(
      http.post(`${API}/clubs/:clubId/handovers/:handoverId/transitions`, () =>
        problem(422, 'Chưa hoàn tất được bàn giao vì còn điều kiện chưa đạt.', 'HANDOVER_BLOCKED', [{ field: 'blockers', message: 'Lý do mới từ máy chủ.' }]),
      ),
    )
    const { result } = await renderComplete({ ...handover, blockers: [] })
    expect(result.current.vm.canSubmit).toBe(true)
    act(() => result.current.vm.submit())
    await waitFor(() => expect(result.current.vm.blockers).toEqual(['Lý do mới từ máy chủ.']))
    expect(result.current.vm.canSubmit).toBe(false)
    expect(result.current.vm.errorMessage).toBeNull()
  })

  it('reports a conflict on 409 instead of completing', async () => {
    const handover = await openHandover()
    server.use(http.post(`${API}/clubs/:clubId/handovers/:handoverId/transitions`, () => problem(409, 'Phiên bàn giao vừa thay đổi.', 'VERSION_CONFLICT')))
    const { result } = await renderComplete({ ...handover, blockers: [] })
    act(() => result.current.vm.submit())
    await waitFor(() => expect(result.current.vm.conflict).toBe(true))
    act(() => result.current.vm.reset())
    await waitFor(() => expect(result.current.vm.conflict).toBe(false))
  })

  it('says who completed it when another board member finished first, and offers the way back', async () => {
    const handover = await openHandover()
    const onClose = vi.fn()
    const { result } = await renderComplete({ ...handover, status: 'COMPLETED', completedBy: { id: 'u-mai', fullName: 'Võ Ngọc Mai' }, completionPreview: null, blockers: [] }, onClose)
    expect(result.current.vm).toMatchObject({ completedBy: 'Võ Ngọc Mai', canSubmit: false, conflict: false })
    act(() => result.current.vm.goToTerms())
    await waitFor(() => expect(result.current.location.pathname).toBe('/clubs/c-guitar/terms'))
    expect(onClose).toHaveBeenCalled()
  })

  it('goes back to the terms page once the server has completed it', async () => {
    const handover = await openHandover()
    server.use(http.post(`${API}/clubs/:clubId/handovers/:handoverId/transitions`, () => Response.json({ ...handover, status: 'COMPLETED', blockers: [], completionPreview: null, allowedActions: [] })))
    const onClose = vi.fn()
    const { result } = await renderComplete({ ...handover, blockers: [] }, onClose)
    act(() => result.current.vm.submit())
    await waitFor(() => expect(result.current.location.pathname).toBe('/clubs/c-guitar/terms'))
    expect(onClose).toHaveBeenCalled()
  })
})
