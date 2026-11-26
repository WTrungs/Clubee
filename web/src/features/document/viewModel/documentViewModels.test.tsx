import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import * as saveBlobModule from '@/shared/lib/saveBlob'
import { createTestWrapper, signInAs } from '@/testUtils'
import { documentFormSchema, parseTags, scopeKeyOf, toUploadRequest, type DocumentFormValues } from './documentFormSchema'
import { documentQueryKeys, useDocumentsViewModel, useUploadDocumentViewModel } from './useDocumentsViewModel'

vi.mock('@/features/club/viewModel/clubContext', () => ({ useCurrentClub: () => ({ clubId: 'c-guitar', club: { allowedActions: [] } }) }))

afterEach(() => vi.restoreAllMocks())

const file = new File(['nội dung'], 'bien-ban.pdf', { type: 'application/pdf' })
const values = (fields: Partial<DocumentFormValues> = {}): DocumentFormValues => ({
  file,
  title: 'Biên bản họp tháng 11',
  description: '',
  scopeKey: 'DEPARTMENT:d-media',
  termId: 't-guitar-2026',
  tagsText: 'biên bản, họp',
  visibility: 'OWNER',
  ...fields,
})
const issuesOf = (input: DocumentFormValues) => {
  const result = documentFormSchema.safeParse(input)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('document form (FR-DOC-01)', () => {
  it('cleans tags and builds the upload request from the chosen owner', () => {
    expect(parseTags(' biên bản,  họp ,biên bản,, ')).toEqual(['biên bản', 'họp'])
    expect(scopeKeyOf({ type: 'CLUB', id: null })).toBe('CLUB')
    expect(scopeKeyOf({ type: 'EVENT', id: 'e-winter' })).toBe('EVENT:e-winter')
    expect(toUploadRequest(values())).toMatchObject({ ownerType: 'DEPARTMENT', ownerId: 'd-media', tags: ['biên bản', 'họp'], termId: 't-guitar-2026' })
    expect(toUploadRequest(values({ scopeKey: 'CLUB', termId: '' }))).toMatchObject({ ownerType: 'CLUB', ownerId: null, termId: null })
  })

  it('needs a file and a title, and at most ten short tags', () => {
    expect(issuesOf(values())).toEqual({})
    expect(issuesOf(values({ file: null }))).toHaveProperty('file', 'Chọn tệp để tải lên.')
    expect(issuesOf(values({ title: 'ab' }))).toHaveProperty('title')
    expect(issuesOf(values({ tagsText: Array.from({ length: 11 }, (_, index) => `nhãn ${index}`).join(',') }))).toHaveProperty('tagsText', 'Tối đa 10 nhãn.')
    expect(issuesOf(values({ tagsText: 'x'.repeat(31) }))).toHaveProperty('tagsText', 'Mỗi nhãn tối đa 30 ký tự.')
  })
})

describe('useDocumentsViewModel (FR-DOC-02)', () => {
  it('saves the downloaded file under the server name', async () => {
    const save = vi.spyOn(saveBlobModule, 'saveBlob').mockImplementation(() => undefined)
    signInAs('u-ha')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper })
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    expect(result.current.canUpload).toBe(false)
    act(() => result.current.download('doc-media-plan'))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Blob), 'ke-hoach-truyen-thong.docx'))
  })

  it('tells the reason and reloads the list when access was lost', async () => {
    vi.spyOn(saveBlobModule, 'saveBlob').mockImplementation(() => undefined)
    const failure = vi.spyOn(toast, 'error')
    signInAs('u-ha')
    const { wrapper, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper })
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    const ha = db.memberships.find((membership) => membership.userId === 'u-ha' && membership.clubId === 'c-guitar')
    if (ha) ha.departmentId = 'd-logistics'
    act(() => result.current.download('doc-media-plan'))
    await waitFor(() => expect(failure).toHaveBeenCalledWith('Bạn không còn quyền xem tài liệu này.'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
  })

  it('filters by tag and resets to the first page', async () => {
    signInAs('u-anh')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useDocumentsViewModel(), { wrapper })
    await waitFor(() => expect(result.current.rows).toHaveLength(4))
    expect(result.current.canUpload).toBe(true)
    act(() => result.current.setTag('bàn giao'))
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['doc-handover-2025']))
    expect(result.current.filtered).toBe(true)
    act(() => result.current.clearFilters())
    await waitFor(() => expect(result.current.rows).toHaveLength(4))
  })
})

describe('useUploadDocumentViewModel (FR-DOC-01)', () => {
  it('starts on the first allowed owner and the current term, newest term first', async () => {
    signInAs('u-linh')
    const { wrapper } = createTestWrapper()
    const scopes = [{ type: 'DEPARTMENT' as const, id: 'd-media', name: 'Ban Truyền thông' }]
    const { result } = renderHook(() => useUploadDocumentViewModel('c-guitar', scopes, () => undefined), { wrapper })
    await waitFor(() => expect(result.current.terms.length).toBeGreaterThan(1))
    await waitFor(() => expect(result.current.form.getValues('termId')).toBe('t-guitar-2026'))
    expect(result.current.form.getValues('scopeKey')).toBe('DEPARTMENT:d-media')
    expect(result.current.terms[0]?.id).toBe('t-guitar-2026')
  })
})
