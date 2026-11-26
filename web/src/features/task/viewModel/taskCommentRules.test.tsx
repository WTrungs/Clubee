import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { taskRepository } from '../model/taskRepository'
import { useTaskCommentsViewModel } from './useTaskCommentsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

/** FormData không chạy trong Vitest nên ghi thẳng tệp đã tải lên vào mock. */
function uploaded(id: string, uploadedBy: string) {
  db.attachments.push({ id, name: 'phac-thao.pdf', size: 1200, contentType: 'application/pdf', uploadedBy, uploadedAt: '2026-11-20T08:00:00+07:00' })
  db.attachmentFiles.push({ attachmentId: id, file: new Blob(['ban phac thao'], { type: 'application/pdf' }) })
  return id
}

describe('bình luận công việc (FR-TASK-07)', () => {
  it('người chính bình luận kèm tệp; người giao, người phối hợp nhận thông báo; ban chủ nhiệm đọc được nhưng không viết', async () => {
    signInAs('u-ha')
    const file = uploaded('f-draft', 'u-ha')
    const comment = await taskRepository.addComment('c-guitar', 't-poster', { body: 'Gửi bản phác thảo đầu tiên.', attachmentIds: [file] })
    expect(comment).toMatchObject({ author: { id: 'u-ha' }, attachments: [{ id: 'f-draft' }], allowedActions: ['HIDE'] })
    const notice = db.notifications.at(-1)
    expect(notice?.title).toBe('Lê Thu Hà bình luận: Thiết kế poster Đêm nhạc Mùa đông')
    expect(db.notificationRecipients.filter((row) => row.notificationId === notice?.id).map((row) => row.userId).toSorted()).toEqual(['u-linh', 'u-vy'])

    signInAs('u-anh')
    const list = await taskRepository.comments('c-guitar', 't-poster')
    expect(list).toMatchObject({ canComment: false, comments: [{ body: 'Gửi bản phác thảo đầu tiên.', allowedActions: [] }] })
    expect(await fail(taskRepository.addComment('c-guitar', 't-poster', { body: 'Ban chủ nhiệm góp ý', attachmentIds: [] }))).toMatchObject({ status: 403 })
    const download = await taskRepository.downloadAttachment('c-guitar', 't-poster', 'f-draft')
    expect(download.fileName).toBe('phac-thao.pdf')
  })

  it('chỉ người viết hoặc người giao ẩn được; ẩn rồi thì mất nội dung, tệp và không tải được tệp', async () => {
    signInAs('u-ha')
    const file = uploaded('f-draft', 'u-ha')
    const comment = await taskRepository.addComment('c-guitar', 't-poster', { body: 'Bản phác thảo.', attachmentIds: [file] })
    signInAs('u-vy')
    expect(await fail(taskRepository.hideComment('c-guitar', 't-poster', comment.id))).toMatchObject({ status: 403 })
    signInAs('u-linh')
    const hidden = await taskRepository.hideComment('c-guitar', 't-poster', comment.id)
    expect(hidden).toMatchObject({ body: null, attachments: [], hidden: { by: { id: 'u-linh' } }, allowedActions: [] })
    expect(await fail(taskRepository.hideComment('c-guitar', 't-poster', comment.id))).toMatchObject({ status: 422, code: 'COMMENT_HIDDEN' })
    expect(await fail(taskRepository.downloadAttachment('c-guitar', 't-poster', 'f-draft'))).toMatchObject({ status: 404 })
    expect(db.taskComments.find((candidate) => candidate.id === comment.id)?.body).toBe('Bản phác thảo.')
  })

  it('việc đã hủy thì 422; tệp của người khác thì 400; người không xem được việc thì 403', async () => {
    signInAs('u-vy')
    expect(await fail(taskRepository.addComment('c-guitar', 't-old-banner', { body: 'Còn cần không?', attachmentIds: [] }))).toMatchObject({ status: 422, code: 'TASK_CANCELLED' })
    const others = uploaded('f-other', 'u-ha')
    expect(await fail(taskRepository.addComment('c-guitar', 't-poster', { body: 'Tệp của Hà', attachmentIds: [others] }))).toMatchObject({ status: 400 })
    expect(await fail(taskRepository.addComment('c-guitar', 't-poster', { body: '   ', attachmentIds: [] }))).toMatchObject({ status: 400 })
    signInAs('u-thao')
    expect(await fail(taskRepository.comments('c-guitar', 't-poster'))).toMatchObject({ status: 403 })
  })

  it('view model: nội dung trống thì báo lỗi; gửi xong thì xóa ô soạn và tải lại danh sách', async () => {
    signInAs('u-ha')
    const { result } = renderHook(() => useTaskCommentsViewModel({ id: 't-poster', clubId: 'c-guitar' }), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.canComment).toBe(true))
    act(() => result.current.submit())
    expect(result.current.bodyError).toBe('Nhập nội dung bình luận.')
    act(() => result.current.setBody('Mình đã xong bản A3.'))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.comments).toHaveLength(1))
    expect(result.current.body).toBe('')
  })
})
