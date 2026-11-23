import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { newsExcerpt } from '@/shared/lib/newsRules'
import { createTestWrapper, signInAs } from '@/testUtils'
import { newsRepository } from '../model/newsRepository'
import { useNewsEditorViewModel, useNewsListViewModel } from './useNewsViewModels'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

async function clubHost(clubId: string) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base } = createTestWrapper()
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('tin tức CLB (FR-CLB-06, ST-NEWS)', () => {
  it('thành viên chỉ thấy tin đã xuất bản; tin nháp, tin ẩn trả 404', async () => {
    signInAs('u-ha')
    const page = await newsRepository.list('c-guitar', {})
    expect(page.content.map((news) => news.id)).toEqual(['news-winter-show', 'news-workshop'])
    expect((await newsRepository.list('c-guitar', { status: 'DRAFT' })).content).toHaveLength(2)
    expect(await fail(newsRepository.get('c-guitar', 'news-recap-draft'))).toMatchObject({ status: 404 })
    expect(await fail(newsRepository.get('c-guitar', 'news-old-hidden'))).toMatchObject({ status: 404 })
    expect((await newsRepository.get('c-guitar', 'news-workshop')).allowedActions).toEqual([])
    expect(await fail(newsRepository.create('c-guitar', { title: 'Tin của thành viên', body: 'Thành viên thường không viết tin được.' }))).toMatchObject({ status: 403 })
  })

  it('ban chủ nhiệm thấy mọi trạng thái, lọc theo trạng thái và tiêu đề', async () => {
    signInAs('u-anh')
    expect((await newsRepository.list('c-guitar', {})).content).toHaveLength(4)
    expect((await newsRepository.list('c-guitar', { status: 'HIDDEN' })).content.map((news) => news.id)).toEqual(['news-old-hidden'])
    expect((await newsRepository.list('c-guitar', { q: 'workshop' })).content.map((news) => news.id)).toEqual(['news-workshop'])
  })

  it('viết nháp, sửa, xuất bản, ẩn rồi hiện lại; version cũ thì 409, trạng thái sai thì 422', async () => {
    signInAs('u-anh')
    const draft = await newsRepository.create('c-guitar', { title: 'Tuyển ca sĩ cho đêm nhạc', body: 'CLB tìm 2 bạn hát chính cho Đêm nhạc Mùa đông, tập vào tối thứ Năm.' })
    expect(draft).toMatchObject({ status: 'DRAFT', publishedAt: null, allowedActions: ['EDIT', 'PUBLISH'] })
    expect(await fail(newsRepository.hide('c-guitar', draft.id, draft.version))).toMatchObject({ status: 422, code: 'NEWS_NOT_PUBLISHED' })
    const edited = await newsRepository.update('c-guitar', draft.id, { title: 'Tuyển ca sĩ cho Đêm nhạc Mùa đông', body: draft.body, version: draft.version })
    expect(await fail(newsRepository.update('c-guitar', draft.id, { title: 'Bản cũ hơn', body: draft.body, version: draft.version }))).toMatchObject({ status: 409 })
    const published = await newsRepository.publish('c-guitar', draft.id, edited.version)
    expect(published.status).toBe('PUBLISHED')
    expect(published.publishedAt).not.toBeNull()
    expect(await fail(newsRepository.publish('c-guitar', draft.id, published.version))).toMatchObject({ status: 422, code: 'NEWS_ALREADY_PUBLISHED' })
    const hidden = await newsRepository.hide('c-guitar', draft.id, published.version)
    expect(hidden).toMatchObject({ status: 'HIDDEN', hiddenBy: { id: 'u-anh' } })
    const shown = await newsRepository.publish('c-guitar', draft.id, hidden.version)
    expect(shown).toMatchObject({ status: 'PUBLISHED', publishedAt: published.publishedAt, hiddenAt: null })
  })

  it('kiểm độ dài tiêu đề, nội dung (400 theo từng ô)', async () => {
    signInAs('u-anh')
    const error = await fail(newsRepository.create('c-guitar', { title: 'Tin', body: 'Ngắn quá' }))
    expect(error).toMatchObject({ status: 400 })
    expect(error?.fieldErrors.map((item) => item.field)).toEqual(['title', 'body'])
  })

  it('newsExcerpt gộp dòng và cắt ở ranh giới từ', () => {
    expect(newsExcerpt('Dòng một\nDòng hai')).toBe('Dòng một Dòng hai')
    const long = newsExcerpt('chữ '.repeat(60), 20)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(21)
  })
})

describe('view model tin tức', () => {
  it('thành viên không có nút quản lý; ban chủ nhiệm lọc được trạng thái', async () => {
    signInAs('u-ha')
    const member = renderHook(() => useNewsListViewModel(), { wrapper: await clubHost('c-guitar') })
    await waitFor(() => expect(member.result.current.rows).toHaveLength(2))
    expect(member.result.current.canManage).toBe(false)

    signInAs('u-anh')
    const board = renderHook(() => useNewsListViewModel(), { wrapper: await clubHost('c-guitar') })
    await waitFor(() => expect(board.result.current.rows).toHaveLength(4))
    act(() => board.result.current.toggleStatus('DRAFT'))
    await waitFor(() => expect(board.result.current.rows.map((news) => news.id)).toEqual(['news-recap-draft']))
    expect(board.result.current.filtered).toBe(true)
  })

  it('soạn tin mới lưu thành nháp rồi gọi onSaved với tin vừa tạo', async () => {
    signInAs('u-anh')
    let saved: string | null = null
    const { result } = renderHook(() => useNewsEditorViewModel(true, null, (news) => (saved = news.status)), { wrapper: await clubHost('c-guitar') })
    act(() => {
      result.current.form.setValue('title', 'Lịch tập tuần sau')
      result.current.form.setValue('body', 'Tuần sau CLB tập vào tối thứ Ba và thứ Năm tại phòng B2.04.')
    })
    await act(() => result.current.submit())
    await waitFor(() => expect(saved).toBe('DRAFT'))
  })

  it('ảnh bìa sai định dạng thì báo lỗi, không nhận', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useNewsEditorViewModel(true, null, () => undefined), { wrapper: await clubHost('c-guitar') })
    act(() => result.current.pickImage(new File(['x'], 'bia.gif', { type: 'image/gif' })))
    expect(result.current.imageError).toBe('Ảnh bìa chỉ nhận tệp JPG hoặc PNG.')
    expect(result.current.imageUrl).toBeNull()
  })
})
