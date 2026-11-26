import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { documentRepository } from '../model/documentRepository'
import { useDocumentsViewModel, useUploadVersionViewModel } from './useDocumentsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
/** Vitest không gửi được FormData, nên quyền của route tải bản mới được thử bằng thân rỗng (route kiểm quyền trước khi đọc tệp). */
const postEmptyVersion = (documentId: string) => fail(httpClient.post(`/clubs/c-guitar/documents/${documentId}/versions`))
const actionsOf = async (userId: string, documentId: string) => {
  signInAs(userId)
  return (await documentRepository.get('c-guitar', documentId)).allowedActions
}

describe('phiên bản tài liệu (FR-DOC-03)', () => {
  it('giữ mọi phiên bản, mới nhất trước, đánh dấu bản hiện hành', async () => {
    signInAs('u-thao')
    const rules = await documentRepository.get('c-guitar', 'doc-rules')
    expect(rules.currentVersion).toBe(2)
    expect(rules.versions.map((version) => [version.number, version.current, version.fileName])).toEqual([
      [2, true, 'noi-quy-2026.pdf'],
      [1, false, 'noi-quy-2026-du-thao.pdf'],
    ])
    expect(rules.versions[1]?.note).toBe('Bản dự thảo đưa ra lấy ý kiến.')
  })

  it('tải lại được bản cũ, vẫn kiểm quyền xem mỗi lần', async () => {
    signInAs('u-thao')
    expect((await documentRepository.download('c-guitar', 'doc-rules', 1)).fileName).toBe('noi-quy-2026-du-thao.pdf')
    expect((await documentRepository.download('c-guitar', 'doc-rules')).fileName).toBe('noi-quy-2026.pdf')
    expect(await fail(documentRepository.download('c-guitar', 'doc-rules', 9))).toMatchObject({ status: 404, code: 'VERSION_NOT_FOUND' })
    expect(await fail(documentRepository.download('c-guitar', 'doc-media-plan', 1))).toMatchObject({ status: 403 })
  })

  it('người tạo hoặc người quản lý nơi sở hữu được tải bản mới; thành viên thường thì không', async () => {
    expect(await actionsOf('u-linh', 'doc-media-plan')).toContain('UPLOAD_VERSION')
    expect(await actionsOf('u-anh', 'doc-media-plan')).toContain('UPLOAD_VERSION')
    expect(await actionsOf('u-bao', 'doc-winter-budget')).toContain('UPLOAD_VERSION')
    expect(await actionsOf('u-ha', 'doc-media-plan')).toEqual([])
    expect(await actionsOf('u-linh', 'doc-rules')).toEqual([])
    // Người tạo vẫn được tải bản mới khi không còn quyền Quản lý tài liệu.
    const plan = db.documents.find((document) => document.id === 'doc-media-plan')
    if (plan) plan.createdBy = 'u-ha'
    expect(await actionsOf('u-ha', 'doc-media-plan')).toEqual(['UPLOAD_VERSION'])
  })

  it('route tải bản mới: 404 khi không xem được, 403 khi không có quyền', async () => {
    signInAs('u-ha')
    expect(await postEmptyVersion('doc-media-plan')).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    signInAs('u-thao')
    expect(await postEmptyVersion('doc-media-plan')).toMatchObject({ status: 404, code: 'DOCUMENT_NOT_FOUND' })
    expect(await postEmptyVersion('doc-khong-co')).toMatchObject({ status: 404 })
    signInAs('u-tu')
    expect(await postEmptyVersion('doc-rules')).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })
})

describe('view model phiên bản', () => {
  async function clubWrapper() {
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/documents')
    return ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
  }

  it('tải đúng bản được chọn và báo bản đang tải', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    act(() => result.current.download('doc-rules', 1))
    await waitFor(() => expect(result.current.downloadingVersion).toBe(1))
    await waitFor(() => expect(result.current.downloadingId).toBeNull())
  })

  it('form bản mới bắt buộc tệp và ghi chú, nêu số bản sắp tạo', async () => {
    signInAs('u-anh')
    const detail = await documentRepository.get('c-guitar', 'doc-rules')
    const { result } = renderHook(() => useUploadVersionViewModel('c-guitar', detail, () => {}), { wrapper: createTestWrapper().wrapper })
    expect(result.current.nextNumber).toBe(3)
    act(() => result.current.form.setValue('note', 'abc'))
    await act(() => result.current.submit())
    expect(result.current.form.getFieldState('file').error?.message).toBe('Chọn tệp của phiên bản mới.')
    expect(result.current.form.getFieldState('note').error?.message).toBe('Ghi chú thay đổi cần ít nhất 5 ký tự.')
  })
})
