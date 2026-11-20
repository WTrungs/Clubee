import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { departmentOn } from '@/api/mocks/mockMembers'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'
import { stintRange, transferErrorLines, transferSummary } from './memberDisplay'
import { useTransferDepartmentViewModel, type TransferMember } from './useTransferDepartmentViewModel'

describe('department transfer display (FR-MEM-10)', () => {
  it('formats stints, summaries and per-person errors', () => {
    expect(stintRange({ fromOn: '2025-09-01', toOn: null })).toBe('01/09/2025 – nay')
    expect(stintRange({ fromOn: '2025-09-01', toOn: '2026-01-31' })).toBe('01/09/2025 – 31/01/2026')
    expect(transferSummary(['Hoàng Thảo Vy'], 'Chuyên môn')).toBe('Đã chuyển Hoàng Thảo Vy sang Ban Chuyên môn.')
    expect(transferSummary(['A', 'B', 'C'], 'Chuyên môn')).toBe('Đã chuyển 3 người sang Ban Chuyên môn.')
    const error = new ApiError(400, {
      detail: 'Có người đã thuộc ban được chọn.',
      errors: [
        { field: 'members[0]', message: 'Lê Thu Hà đã thuộc ban Truyền thông.' },
        { field: 'toDepartmentId', message: 'Không hiện ở danh sách theo người.' },
      ],
    })
    expect(transferErrorLines(error)).toEqual(['Có người đã thuộc ban được chọn.', 'Lê Thu Hà đã thuộc ban Truyền thông.'])
  })

  it('finds the department of a day, ignoring a step cancelled within the same day', () => {
    const history = [
      { departmentId: 'd-a', fromOn: '2026-01-01', toOn: '2026-03-31', changedBy: null },
      { departmentId: 'd-b', fromOn: '2026-04-01', toOn: '2026-03-31', changedBy: null },
      { departmentId: 'd-c', fromOn: '2026-04-01', toOn: null, changedBy: null },
    ]
    expect(departmentOn({ departmentHistory: history }, '2025-12-31')).toBeNull()
    expect(departmentOn({ departmentHistory: history }, '2026-03-31')).toBe('d-a')
    expect(departmentOn({ departmentHistory: history }, '2026-04-01')).toBe('d-c')
  })
})

describe('useTransferDepartmentViewModel (NFR-REL-03, IF-01)', () => {
  const render = async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const onDone = vi.fn()
    const hook = renderHook(() => useTransferDepartmentViewModel('d-media', onDone), { wrapper })
    await waitFor(() => expect(hook.result.current.departmentsLoading).toBe(false))
    return { ...hook, onDone }
  }
  const member = async (membershipId: string): Promise<TransferMember> => memberRepository.get('c-guitar', membershipId)

  it('says so when the club has no other active department', async () => {
    for (const department of db.departments) if (department.clubId === 'c-guitar' && department.id !== 'd-media') department.status = 'CLOSED'
    const { result } = await render()
    expect(result.current.departments).toEqual([])
    expect(result.current.noOtherDepartment).toBe(true)
  })

  it('offers only other active departments and closes after the server confirms', async () => {
    const { result, onDone } = await render()
    expect(result.current.noOtherDepartment).toBe(false)
    expect(result.current.departments.map((department) => department.id)).not.toContain('d-media')
    expect(result.current.departments.map((department) => department.id)).not.toContain('d-photo')
    const vy = await member('m-guitar-vy')
    act(() => result.current.submit('d-music', [vy]))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(db.memberships.find((membership) => membership.id === 'm-guitar-vy')?.departmentId).toBe('d-music')
  })

  it('keeps the dialog open with the reason when someone still holds a department position', async () => {
    const { result, onDone } = await render()
    const linh = await member('m-guitar-linh')
    act(() => result.current.submit('d-music', [linh]))
    await waitFor(() => expect(result.current.errorLines[0]).toContain('Còn giữ chức vụ ở ban cũ'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes and reloads instead of overwriting when the list is stale', async () => {
    const { result, onDone } = await render()
    const vy = await member('m-guitar-vy')
    const stored = db.memberships.find((membership) => membership.id === 'm-guitar-vy')
    if (stored) stored.version += 1
    act(() => result.current.submit('d-music', [vy]))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(stored?.departmentId).toBe('d-media')
    expect(result.current.errorLines).toEqual([])
  })
})
