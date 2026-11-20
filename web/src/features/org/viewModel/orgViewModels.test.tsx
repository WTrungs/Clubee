import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { formatDate } from '@/shared/format/formatDate'
import { createTestWrapper, signInAs } from '@/testUtils'
import { orgRepository } from '../model/orgRepository'
import { useAssignPositionViewModel } from './useAssignPositionViewModel'
import { useRevokePositionViewModel } from './useRevokePositionViewModel'

async function clubWrapper(clubId: string) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base } = createTestWrapper()
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('useAssignPositionViewModel (FR-ORG-02)', () => {
  it('offers president and vice president only when the server allows it', async () => {
    signInAs('u-mai')
    const treasurer = renderHook(() => useAssignPositionViewModel({ role: 'PRESIDENT' }, () => {}), { wrapper: await clubWrapper('c-guitar') })
    expect(treasurer.result.current.roleOptions).toEqual(['TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD'])
    expect(treasurer.result.current.role).toBe('')

    signInAs('u-huy')
    const vice = renderHook(() => useAssignPositionViewModel({}, () => {}), { wrapper: await clubWrapper('c-guitar') })
    expect(vice.result.current.roleOptions).toContain('PRESIDENT')
  })

  it('drops the chosen person when the role changes, so a hidden choice is never sent', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useAssignPositionViewModel({}, () => {}), { wrapper })

    act(() => result.current.setRole('VICE_PRESIDENT'))
    await waitFor(() => expect(result.current.candidates.length).toBeGreaterThan(0))
    act(() => result.current.setUserId('u-long'))
    expect(result.current.userId).toBe('u-long')

    act(() => result.current.setRole('TREASURER'))
    expect(result.current.userId).toBe('')
    act(() => result.current.setRole('DEPARTMENT_HEAD'))
    act(() => result.current.setDepartmentId('d-design'))
    expect(result.current.userId).toBe('')
  })

  it('keeps a person opened from the member profile and flags when they are not eligible', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useAssignPositionViewModel({ userId: 'u-vy', userName: 'Hoàng Thảo Vy' }, () => {}), { wrapper })

    act(() => result.current.setRole('DEPARTMENT_HEAD'))
    act(() => result.current.setDepartmentId('d-design'))
    expect(result.current.userId).toBe('u-vy')
    await waitFor(() => expect(result.current.presetIneligible).toBe(true))

    act(() => result.current.setDepartmentId('d-media'))
    await waitFor(() => expect(result.current.presetIneligible).toBe(false))
  })

  it('clears the chosen person after a 409 because they already hold the role', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useAssignPositionViewModel({}, () => {}), { wrapper })
    act(() => result.current.setRole('VICE_PRESIDENT'))
    await waitFor(() => expect(result.current.candidates.length).toBeGreaterThan(0))
    act(() => result.current.setUserId('u-long'))
    grantPosition({ userId: 'u-long', clubId: 'c-guitar', role: 'VICE_PRESIDENT', scopeId: 'c-guitar', assignedBy: 'u-anh' })

    await act(async () => {
      await result.current.submit()
    })
    await waitFor(() => expect(result.current.errorMessage).toContain('đang giữ chức vụ này'))
    expect(result.current.userId).toBe('')
  })
})

describe('useRevokePositionViewModel when the term is past its end (BR-TERM-02)', () => {
  it('accepts a handover date from today on, because the position lasts until the handover is done', async () => {
    signInAs('u-anh')
    const term = db.terms.find((candidate) => candidate.id === 't-guitar-2026')
    const oldEnd = term?.endOn
    if (term) term.endOn = vnDate(-1)
    for (const position of db.positions) if (position.clubId === 'c-guitar' && position.endOn === oldEnd) position.endOn = vnDate(-1)
    const treasurer = (await orgRepository.positions('c-guitar', { scopeId: 'c-guitar' })).content.find((position) => position.role === 'TREASURER')
    if (!treasurer) throw new Error('Thiếu Thủ quỹ trong seed')
    expect(treasurer.untilHandover).toBe(true)

    const onDone = vi.fn()
    const wrapper = await clubWrapper('c-guitar')
    const { result } = renderHook(() => useRevokePositionViewModel(treasurer, onDone), { wrapper })
    expect(result.current.lastDay).toBeNull()
    act(() => {
      result.current.form.setValue('reason', 'Thôi giữ chức Thủ quỹ.')
      result.current.form.setValue('handoverDate', formatDate(`${vnDate(3)}T12:00:00+07:00`))
    })
    await act(() => result.current.submit())

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(db.positions.find((position) => position.id === treasurer.id)?.endOn).toBe(vnDate(2))
  })
})
