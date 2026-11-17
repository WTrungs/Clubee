import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'
import { describeInfoChange, memberSubtitle } from './memberDisplay'
import { memberInfoSchema, toMemberInfoValues, toUpdateMemberInfoRequest } from './memberInfoSchema'
import { useMemberInfoViewModel } from './useMemberInfoViewModel'

const context = { today: '2026-11-15', foundedOn: '2016-09-15', collectsStudentId: true }
const valid = { displayTitle: 'Trưởng nhóm bè', internalNote: '', studentId: '', joinedOn: '01/09/2025' }
const issues = (values: typeof valid, overrides: Partial<typeof context> = {}) => {
  const result = memberInfoSchema({ ...context, ...overrides }).safeParse(values)
  return result.success ? [] : result.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`)
}

describe('member info form (FR-MEM-05)', () => {
  it('accepts an empty title, note and student id but requires a real join date', () => {
    expect(issues(valid)).toEqual([])
    expect(issues({ ...valid, displayTitle: '', joinedOn: '' })).toEqual(['joinedOn: Nhập ngày gia nhập.'])
    expect(issues({ ...valid, joinedOn: '2025-09-01' })).toEqual(['joinedOn: Nhập ngày dạng dd/mm/yyyy.'])
    expect(issues({ ...valid, joinedOn: '31/02/2025' })).toEqual(['joinedOn: Ngày gia nhập không hợp lệ.'])
    expect(issues({ ...valid, joinedOn: '16/11/2026' })).toEqual(['joinedOn: Ngày gia nhập không được sau hôm nay.'])
    expect(issues({ ...valid, joinedOn: '14/09/2016' })).toEqual(['joinedOn: Ngày gia nhập không được trước ngày thành lập CLB (15/09/2016).'])
  })

  it('limits lengths and checks the student id only when the club collects it', () => {
    expect(issues({ ...valid, displayTitle: 'x'.repeat(61), internalNote: 'y'.repeat(1001) }).map((issue) => issue.split(':')[0])).toEqual(['displayTitle', 'internalNote'])
    expect(issues({ ...valid, studentId: 'ab' })).toEqual(['studentId: MSSV gồm 5–20 chữ hoặc số.'])
    expect(issues({ ...valid, studentId: 'ab' }, { collectsStudentId: false })).toEqual([])
  })

  it('maps between the API and the form, trimming and turning blanks into null', () => {
    const values = toMemberInfoValues({ displayTitle: null, internalNote: 'Ghi chú', studentId: null, joinedOn: '2025-09-01' })
    expect(values).toEqual({ displayTitle: '', internalNote: 'Ghi chú', studentId: '', joinedOn: '01/09/2025' })
    expect(toUpdateMemberInfoRequest({ ...values, displayTitle: '  Bè trầm ', internalNote: '   ' }, 3)).toEqual({
      displayTitle: 'Bè trầm',
      internalNote: null,
      studentId: null,
      joinedOn: '2025-09-01',
      version: 3,
    })
  })

  it('describes history lines and the subtitle', () => {
    expect(describeInfoChange({ field: 'joinedOn', from: '2025-09-01', to: '2025-09-15' })).toEqual({ label: 'Ngày gia nhập', from: '01/09/2025', to: '15/09/2025' })
    expect(describeInfoChange({ field: 'displayTitle', from: null, to: 'Bè trầm' })).toEqual({ label: 'Chức danh hiển thị', from: '(trống)', to: 'Bè trầm' })
    expect(memberSubtitle({ displayTitle: 'Bè trầm', department: { id: 'd-music', name: 'Chuyên môn' }, status: 'ACTIVE' })).toBe('Bè trầm · Ban Chuyên môn · Chính thức')
    expect(memberSubtitle({ displayTitle: null, department: null, status: 'ON_LEAVE' })).toBe('Chưa có ban · Tạm nghỉ')
  })
})

describe('useMemberInfoViewModel (NFR-REL-03)', () => {
  const render = async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const member = await memberRepository.get('c-guitar', 'm-guitar-vy')
    const { wrapper: Base } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const onDone = vi.fn()
    return { ...renderHook(() => useMemberInfoViewModel(member, onDone), { wrapper }), onDone }
  }
  const vy = () => db.memberships.find((membership) => membership.id === 'm-guitar-vy')

  it('saves and closes only after the server confirms', async () => {
    const { result, onDone } = await render()
    act(() => result.current.form.setValue('displayTitle', 'Trưởng nhóm nội dung', { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(vy()?.displayTitle).toBe('Trưởng nhóm nội dung')
  })

  it('shows the conflict banner instead of overwriting, then reloads the latest info', async () => {
    const { result, onDone } = await render()
    act(() => result.current.form.setValue('internalNote', 'Ghi chú của tôi', { shouldDirty: true }))
    const membership = vy()
    if (membership) Object.assign(membership, { displayTitle: 'Do người khác sửa', version: membership.version + 1 })

    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(vy()?.internalNote).toBeNull()
    expect(onDone).not.toHaveBeenCalled()

    await act(() => result.current.reload())
    expect(result.current.conflict).toBe(false)
    expect(result.current.form.getValues('displayTitle')).toBe('Do người khác sửa')
  })

  it('puts server field errors on the matching input', async () => {
    const { result } = await render()
    act(() => result.current.form.setValue('joinedOn', '01/01/2026', { shouldDirty: true }))
    const membership = vy()
    grantPosition({ userId: 'u-vy', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-media', assignedBy: 'u-anh', startOn: '2025-06-01' })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getFieldState('joinedOn').error?.message).toBe('Ngày gia nhập không được sau ngày bắt đầu chức vụ đầu tiên (01/06/2025).'))
    expect(result.current.errorMessage).toBeNull()
    expect(vy()?.joinedOn).toBe(membership?.joinedOn)
  })
})
