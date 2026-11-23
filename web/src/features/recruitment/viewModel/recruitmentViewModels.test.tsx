import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { recruitmentFieldPath, recruitmentFormSchema, toRecruitmentFormValues, toRecruitmentRequest, type RecruitmentFormValues } from './recruitmentFormSchema'
import { useRecruitmentFormViewModel } from './useRecruitmentViewModels'

afterEach(() => vi.restoreAllMocks())

const values = (fields: Partial<RecruitmentFormValues> = {}): RecruitmentFormValues => ({
  ...toRecruitmentFormValues(null),
  name: 'Tuyển thành viên học kỳ 2',
  opensDate: '01/02/2027',
  closesDate: '15/02/2027',
  quotas: [{ departmentId: 'd-media', quota: '4' }],
  ...fields,
})
const issuesOf = (input: RecruitmentFormValues) => {
  const result = recruitmentFormSchema.safeParse(input)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

async function renderForm(recruitmentId: string | null, onDone = vi.fn()) {
  signInAs('u-anh')
  const club = await clubRepository.getClub('c-guitar')
  const editing = recruitmentId ? await recruitmentRepository.get('c-guitar', recruitmentId) : null
  const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/recruitments')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  const view = renderHook(() => useRecruitmentFormViewModel(editing, onDone), { wrapper })
  await waitFor(() => expect(view.result.current.departmentOptions.length).toBeGreaterThan(0))
  return { ...view, onDone, editing }
}

describe('recruitment form (FR-REC-01)', () => {
  it('builds the request with times in Vietnam and number quotas', () => {
    expect(issuesOf(values())).toEqual({})
    expect(toRecruitmentRequest(values())).toMatchObject({ opensAt: '2027-02-01T08:00:00+07:00', closesAt: '2027-02-15T22:00:00+07:00', quotas: [{ departmentId: 'd-media', quota: 4 }] })
  })

  it('names the row at fault and refuses closing before opening', () => {
    const issues = issuesOf(
      values({
        closesDate: '31/01/2027',
        quotas: [
          { departmentId: 'd-media', quota: '0' },
          { departmentId: 'd-media', quota: '2' },
        ],
        rounds: [
          { id: null, name: 'Vòng A' },
          { id: null, name: 'vòng a' },
        ],
        questions: [{ id: null, text: 'Hi', required: true }],
      }),
    )
    expect(issues).toMatchObject({
      closesDate: 'Giờ đóng phải sau giờ mở.',
      'quotas.0.quota': 'Từ 1 đến 500.',
      'quotas.1.departmentId': 'Ban này đã có ở dòng khác.',
      'rounds.1.name': 'Tên vòng bị trùng.',
      'questions.0.text': 'Câu hỏi cần từ 3 đến 300 ký tự.',
    })
  })

  it('maps server fields onto form paths', () => {
    expect(recruitmentFieldPath('quotas[2].quota')).toBe('quotas.2.quota')
    expect(recruitmentFieldPath('opensAt')).toBe('opensDate')
    expect(recruitmentFieldPath('closesAt')).toBe('closesDate')
    expect(recruitmentFieldPath('judgeIds')).toBe('judgeIds')
  })
})

describe('useRecruitmentFormViewModel (FR-REC-01, NFR-REL-03)', () => {
  it('opens a recruitment and offers only official members as judges', async () => {
    const { result, onDone } = await renderForm(null)
    await waitFor(() => expect(result.current.judgeOptions.length).toBeGreaterThan(0))
    expect(result.current.judgeOptions.some((candidate) => candidate.id === 'u-thao')).toBe(false)
    act(() => {
      for (const [key, value] of Object.entries(values({ opensDate: '01/02/2030', closesDate: '15/02/2030' }))) result.current.form.setValue(key as keyof RecruitmentFormValues, value as never)
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(db.recruitments.some((recruitment) => recruitment.name === 'Tuyển thành viên học kỳ 2')).toBe(true)
  })

  it('after opening sends only what can still change, so unchanged rounds never trip the lock', async () => {
    const update = vi.spyOn(recruitmentRepository, 'update')
    const { result, onDone } = await renderForm('rec-guitar-k1')
    expect(result.current.locked).toBe(true)
    act(() => result.current.form.setValue('name', 'Tuyển thành viên K1'))
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const sent = update.mock.calls[0]?.[2]
    expect(sent).toMatchObject({ name: 'Tuyển thành viên K1' })
    expect(sent).not.toHaveProperty('rounds')
    expect(sent).not.toHaveProperty('opensAt')
  })

  it('keeps a saved judge who is no longer official visible so they can be removed', async () => {
    const linh = db.memberships.find((membership) => membership.userId === 'u-linh' && membership.clubId === 'c-guitar')
    if (linh) linh.status = 'ON_LEAVE'
    const { result } = await renderForm('rec-guitar-k1')
    await waitFor(() => expect(result.current.judgeOptions.find((candidate) => candidate.id === 'u-linh')).toMatchObject({ note: 'Không còn là thành viên Chính thức' }))
  })

  it('puts a server error on its row and closes on a version conflict', async () => {
    const first = await renderForm('rec-guitar-k1')
    act(() => first.result.current.form.setValue('quotas.0.departmentId', 'd-photo'))
    // Ban đã đóng không có trong ô chọn; gửi thẳng mã ban để máy chủ trả lỗi theo dòng.
    await act(() => first.result.current.submit())
    await waitFor(() => expect(first.result.current.form.getFieldState('quotas.0.departmentId').error?.message).toBeTruthy())

    const failure = vi.spyOn(toast, 'error')
    const stale = await renderForm('rec-guitar-k1')
    const current = db.recruitments.find((recruitment) => recruitment.id === 'rec-guitar-k1')
    if (current) current.version += 1
    await act(() => stale.result.current.submit())
    await waitFor(() => expect(stale.onDone).toHaveBeenCalled())
    expect(failure).toHaveBeenCalledWith(expect.stringContaining('vừa được người khác cập nhật'))
  })
})
