import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { documentRepository } from '../model/documentRepository'
import { useDocumentsViewModel } from './useDocumentsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const versionOf = (id: string) => db.documents.find((document) => document.id === id)?.version ?? 0
const hide = (userId: string, id: string, reason = 'Bản cũ, đã thay bằng kế hoạch mới.') => {
  signInAs(userId)
  return documentRepository.hide('c-guitar', id, { reason, version: versionOf(id) })
}
const listIds = async (userId: string, hidden = false) => {
  signInAs(userId)
  return (await documentRepository.list('c-guitar', { hidden })).content.map((document) => document.id)
}

describe('ẩn tài liệu (FR-DOC-04, BR-DATA-01)', () => {
  it('trưởng ban ẩn tài liệu của ban; thành viên ban không còn thấy, ban chủ nhiệm xem ở danh sách đã ẩn', async () => {
    const saved = await hide('u-linh', 'doc-media-plan')
    expect(saved.hidden).toMatchObject({ by: { id: 'u-linh', fullName: 'Đặng Khánh Linh' }, reason: 'Bản cũ, đã thay bằng kế hoạch mới.' })
    expect(saved.allowedActions).toEqual([])

    expect(await listIds('u-ha')).not.toContain('doc-media-plan')
    expect(await fail(documentRepository.get('c-guitar', 'doc-media-plan'))).toMatchObject({ status: 403, code: 'DOCUMENT_HIDDEN' })
    expect(await fail(documentRepository.download('c-guitar', 'doc-media-plan'))).toMatchObject({ status: 403, code: 'DOCUMENT_HIDDEN' })
    expect(await fail(documentRepository.list('c-guitar', { hidden: true }))).toMatchObject({ status: 403 })

    expect(await listIds('u-anh')).not.toContain('doc-media-plan')
    expect(await listIds('u-anh', true)).toEqual(['doc-media-plan'])
    expect((await documentRepository.get('c-guitar', 'doc-media-plan')).allowedActions).toEqual(['RESTORE'])
    expect((await documentRepository.download('c-guitar', 'doc-media-plan')).fileName).toBe('ke-hoach-truyen-thong.docx')
    // Không xóa bản ghi, phiên bản hay tệp nào.
    expect(db.documents.some((document) => document.id === 'doc-media-plan')).toBe(true)
    expect(db.documentVersions.filter((version) => version.documentId === 'doc-media-plan')).toHaveLength(1)
  })

  it('chỉ người quản lý nơi sở hữu được ẩn; kiểm theo thứ tự 403 → 409 → 422 → 400', async () => {
    expect(await fail(hide('u-ha', 'doc-media-plan'))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(await fail(hide('u-linh', 'doc-rules'))).toMatchObject({ status: 403 })
    signInAs('u-linh')
    expect(await fail(documentRepository.hide('c-guitar', 'doc-media-plan', { reason: 'Lý do hợp lệ', version: 99 }))).toMatchObject({ status: 409 })
    expect(await fail(hide('u-linh', 'doc-media-plan', 'abc'))).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })
    await hide('u-anh', 'doc-media-plan')
    expect(await fail(hide('u-anh', 'doc-media-plan'))).toMatchObject({ status: 422, code: 'DOCUMENT_HIDDEN' })
  })

  it('chỉ ban chủ nhiệm khôi phục; khôi phục xong tài liệu hiện lại như cũ', async () => {
    await hide('u-linh', 'doc-media-plan')
    signInAs('u-linh')
    expect(await fail(documentRepository.restore('c-guitar', 'doc-media-plan', versionOf('doc-media-plan')))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    const restored = await documentRepository.restore('c-guitar', 'doc-media-plan', versionOf('doc-media-plan'))
    expect(restored.hidden).toBeNull()
    expect(await fail(documentRepository.restore('c-guitar', 'doc-media-plan', versionOf('doc-media-plan')))).toMatchObject({ status: 422, code: 'DOCUMENT_NOT_HIDDEN' })
    expect(await listIds('u-ha')).toContain('doc-media-plan')
  })

  it('tài liệu đang ẩn không có thao tác tải phiên bản mới', async () => {
    await hide('u-anh', 'doc-rules')
    signInAs('u-anh')
    expect((await documentRepository.get('c-guitar', 'doc-rules')).allowedActions).not.toContain('UPLOAD_VERSION')
  })
})

describe('useDocumentsViewModel: ẩn và khôi phục', () => {
  async function clubWrapper() {
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper('/clubs/c-guitar/documents')
    return ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
  }

  it('ban chủ nhiệm ẩn, xem danh sách đã ẩn rồi khôi phục', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.rows.length).toBe(4))
    expect(result.current.canViewHidden).toBe(true)
    const plan = result.current.rows.find((document) => document.id === 'doc-media-plan')
    if (!plan) throw new Error('Thiếu doc-media-plan')
    act(() => result.current.setHideTarget(plan))
    act(() => result.current.hide('Đã có kế hoạch mới thay thế.'))
    await waitFor(() => expect(result.current.rows.map((document) => document.id)).not.toContain('doc-media-plan'))
    expect(result.current.hideTarget).toBeNull()

    act(() => result.current.setShowHidden(true))
    await waitFor(() => expect(result.current.rows.map((document) => document.id)).toEqual(['doc-media-plan']))
    const hidden = result.current.rows[0]
    if (!hidden) throw new Error('Thiếu dòng ẩn')
    act(() => result.current.setRestoreTarget(hidden))
    act(() => result.current.restore())
    await waitFor(() => expect(result.current.rows).toHaveLength(0))
  })

  it('thành viên thường không có chế độ xem tài liệu đã ẩn', async () => {
    signInAs('u-ha')
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    expect(result.current.canViewHidden).toBe(false)
    act(() => result.current.setShowHidden(true))
    expect(result.current.showHidden).toBe(false)
  })
})
