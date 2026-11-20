import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { API, problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { termRepository } from '../model/termRepository'
import type { Term } from '../model/termTypes'
import { useDepartmentPlanViewModel } from './useDepartmentPlanViewModel'
import { useTermFormViewModel } from './useTermFormViewModel'

async function preparingTerm(): Promise<Term> {
  signInAs('u-anh')
  return termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
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

async function renderPlan(term: Term, onDone: () => void = () => {}) {
  const wrapper = await clubWrapper()
  return renderHook(() => useDepartmentPlanViewModel(term, onDone), { wrapper })
}

const toVnText = (date: string) => date.split('-').reverse().join('/')

describe('useTermFormViewModel (FR-TERM-01, NFR-REL-03)', () => {
  it('puts a server error on the date field it belongs to', async () => {
    signInAs('u-anh')
    server.use(http.post(`${API}/clubs/:clubId/terms`, () => problem(400, 'Thông tin nhiệm kỳ chưa hợp lệ.', 'VALIDATION', [{ field: 'endOn', message: 'Lỗi ngày kết thúc từ máy chủ.' }])))
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useTermFormViewModel(null, () => {}), { wrapper })
    act(() => {
      result.current.form.setValue('name', 'Nhiệm kỳ 2027–2028')
      result.current.form.setValue('startDate', toVnText(vnDate(301)))
      result.current.form.setValue('endDate', toVnText(vnDate(665)))
    })
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.form.getFieldState('endDate').error?.message).toBe('Lỗi ngày kết thúc từ máy chủ.'))
    expect(result.current.errorMessage).toBeNull()
  })

  it('closes and reloads instead of overwriting when the term changed meanwhile', async () => {
    const term = await preparingTerm()
    await termRepository.update('c-guitar', term.id, { name: 'Nhiệm kỳ 2027', version: term.version })
    const toastError = vi.spyOn(toast, 'error')
    const onDone = vi.fn()
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useTermFormViewModel(term, onDone), { wrapper })
    act(() => result.current.form.setValue('name', 'Tên ghi đè', { shouldDirty: true }))
    await act(() => result.current.submit())

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('vừa được người khác cập nhật'))
    expect(db.terms.find((candidate) => candidate.id === term.id)?.name).toBe('Nhiệm kỳ 2027')
  })
})

describe('useDepartmentPlanViewModel (FR-TERM-01, NFR-REL-03)', () => {
  it('saves a new department and closes only after the server confirms', async () => {
    const term = await preparingTerm()
    const onDone = vi.fn()
    const { result } = await renderPlan(term, onDone)
    expect(result.current.summary).toBe('Giữ 5 ban')

    act(() => result.current.addEntry())
    act(() => result.current.form.setValue(`entries.${result.current.rows.length - 1}.name`, 'Sự kiện', { shouldDirty: true }))
    expect(result.current.summary).toBe('Giữ 5 ban · thêm 1')
    await act(() => result.current.submit())

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(db.terms.find((candidate) => candidate.id === term.id)?.departmentPlan?.some((entry) => entry.name === 'Sự kiện')).toBe(true)
  })

  it('puts a server error on the row it belongs to', async () => {
    const term = await preparingTerm()
    const { result } = await renderPlan(term)
    const index = result.current.rows.findIndex((row) => row.departmentId === 'd-media')
    // Bỏ qua khóa ở giao diện để thấy máy chủ vẫn chặn bỏ ban còn người.
    act(() => result.current.form.setValue(`entries.${index}.dropped`, true, { shouldDirty: true }))
    await act(() => result.current.submit())

    await waitFor(() => expect(result.current.form.getFieldState(`entries.${index}.dropped`).error?.message).toContain('chưa bỏ được'))
    expect(result.current.errorMessage).toBeNull()
  })

  it('shows a conflict instead of overwriting when someone else saved first, then reloads', async () => {
    const term = await preparingTerm()
    const onDone = vi.fn()
    const { result } = await renderPlan(term, onDone)
    act(() => result.current.form.setValue('entries.0.name', 'Tên do tôi sửa', { shouldDirty: true }))
    await termRepository.update('c-guitar', term.id, { name: 'Nhiệm kỳ 2027', version: term.version })

    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(db.terms.find((candidate) => candidate.id === term.id)?.departmentPlan?.some((entry) => entry.name === 'Tên do tôi sửa')).toBe(false)

    await act(() => result.current.reload())
    expect(result.current.conflict).toBe(false)
    expect(result.current.form.getValues('entries.0.name')).not.toBe('Tên do tôi sửa')
    expect(onDone).not.toHaveBeenCalled()
  })
})
