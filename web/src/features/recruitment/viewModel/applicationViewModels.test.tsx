import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { applicationFieldPath, applicationFormSchema, emptyApplication, toSubmitRequest } from './applicationFormSchema'
import { useApplicationFormViewModel, useApplicationsViewModel, useMyApplicationsViewModel } from './useApplicationViewModels'

afterEach(() => vi.restoreAllMocks())

const questions = [
  { id: 'q1', text: 'Vì sao?', required: true },
  { id: 'q2', text: 'Thời gian?', required: false },
]
const recruitment = { questions, collectsStudentId: true }
const issuesOf = (values: ReturnType<typeof emptyApplication>) => {
  const result = applicationFormSchema(recruitment).safeParse(values)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('application form (FR-REC-02)', () => {
  it('needs a first choice, ordered distinct choices, required answers and the student id', () => {
    expect(issuesOf({ choices: ['', '', ''], answers: ['', ''], studentId: '' })).toEqual({
      'choices.0': 'Chọn nguyện vọng 1.',
      'answers.0': 'Câu này bắt buộc trả lời.',
      studentId: 'MSSV gồm 5–20 chữ hoặc số.',
    })
    expect(issuesOf({ choices: ['d-a', 'd-a', ''], answers: ['Có', ''], studentId: '23520001' })).toEqual({ 'choices.1': 'Ban này đã chọn ở nguyện vọng trước.' })
    expect(issuesOf({ choices: ['d-a', '', 'd-b'], answers: ['Có', ''], studentId: '23520001' })).toEqual({ 'choices.2': 'Chọn nguyện vọng 2 trước.' })
  })

  it('sends choices in order and answers by question, and maps server fields back', () => {
    expect(toSubmitRequest(recruitment, { choices: ['d-a', 'd-b', ''], answers: [' Có ', ''], studentId: ' 23520001 ' })).toEqual({
      choices: ['d-a', 'd-b'],
      answers: [
        { questionId: 'q1', text: 'Có' },
        { questionId: 'q2', text: '' },
      ],
      studentId: '23520001',
    })
    expect(toSubmitRequest({ questions, collectsStudentId: false }, { choices: ['d-a', '', ''], answers: ['Có', ''], studentId: 'x' }).studentId).toBeNull()
    expect(applicationFieldPath('answers[1].text')).toBe('answers.1')
    expect(applicationFieldPath('choices')).toBe('choices.0')
    expect(applicationFieldPath('studentId')).toBe('studentId')
  })
})

async function clubWrapper() {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper()
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('applicant view models (FR-REC-02)', () => {
  it('submits an application and shows the server error on the right answer', async () => {
    signInAs('u-tam')
    const target = await recruitmentRepository.publicRecruitment('rec-guitar-k1')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useApplicationFormViewModel(target), { wrapper })
    // Câu hỏi vừa thành bắt buộc ở máy chủ nên form không biết; lỗi trả về phải gắn đúng ô.
    const question = db.recruitments.find((candidate) => candidate.id === 'rec-guitar-k1')?.questions[2]
    if (question) question.required = true
    act(() => {
      result.current.form.setValue('choices.0', 'd-music')
      result.current.form.setValue('answers.0', 'Muốn học đàn.')
      result.current.form.setValue('answers.1', 'Chưa.')
      result.current.form.setValue('studentId', '23520123')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getFieldState('answers.2').error?.message).toBe('Câu này bắt buộc trả lời.'))
    expect(result.current.errorMessage).toBeNull()

    act(() => result.current.form.setValue('answers.2', '2 buổi'))
    const success = vi.spyOn(toast, 'success')
    await act(() => result.current.submit())
    await waitFor(() => expect(success).toHaveBeenCalled())
    expect(db.applications.some((application) => application.userId === 'u-tam')).toBe(true)
  })

  it('withdraws from the My applications tab and reloads on a stale version', async () => {
    signInAs('u-tu')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useMyApplicationsViewModel(true), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    const [mine] = result.current.rows
    if (!mine) throw new Error('Thiếu đơn')
    act(() => result.current.askWithdraw(mine))
    act(() => result.current.confirmWithdraw())
    await waitFor(() => expect(result.current.rows[0]?.status).toBe('WITHDRAWN'))
    expect(result.current.withdrawTarget).toBeNull()

    const failure = vi.spyOn(toast, 'error')
    act(() => result.current.askWithdraw(mine))
    act(() => result.current.confirmWithdraw())
    await waitFor(() => expect(failure).toHaveBeenCalled())
  })

  it('filters applications on the board side and opens one', async () => {
    signInAs('u-anh')
    const detail = await recruitmentRepository.get('c-guitar', 'rec-guitar-k1')
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useApplicationsViewModel('c-guitar', detail, true), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    act(() => result.current.setDepartmentId('d-logistics'))
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['ap-dat']))
    act(() => result.current.openDetail('ap-dat'))
    await waitFor(() => expect(result.current.detail?.studentId).toBe('21520099'))
  })
})
