import type { TaskComment, TaskCommentList } from '@/features/task/model/taskTypes'
import { db } from './db'
import { personRef } from './mockMembers'
import { eventLockReason } from './mockScopes'
import type { DbTask } from './seed/taskSeed'

/** Bình luận công việc (FR-TASK-07); ẩn chứ không xóa (BR-DATA-01). */
export interface DbTaskComment {
  id: string
  taskId: string
  authorId: string
  body: string
  attachmentIds: string[]
  createdAt: string
  hidden: { by: string; at: string } | null
}

/** Nội dung tệp tải lên (mock giữ trong bộ nhớ; máy chủ thật lưu ở kho S3, IF-05). */
export interface DbAttachmentFile {
  attachmentId: string
  file: Blob
}

export const COMMENT_MAX = 2000
export const COMMENT_FILES_MAX = 5

export const isTaskParticipant = (task: DbTask, userId: string) => task.assignerId === userId || task.ownerId === userId || task.collaboratorIds.includes(userId)

/** Lý do không viết được bình luận; null là viết được. */
export function commentBlocker(task: DbTask): string | null {
  if (task.status === 'CANCELLED') return 'Việc đã hủy nên không bình luận thêm được.'
  return eventLockReason(task)
}

export const commentsOf = (taskId: string) => db.taskComments.filter((comment) => comment.taskId === taskId).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))

const fileRefs = (ids: string[]) =>
  ids.flatMap((id) => {
    const file = db.attachments.find((attachment) => attachment.id === id)
    return file ? [{ id: file.id, name: file.name, size: file.size, contentType: file.contentType }] : []
  })

export function toTaskComment(comment: DbTaskComment, task: DbTask, viewerId: string): TaskComment {
  const canHide = comment.hidden === null && commentBlocker(task) === null && (comment.authorId === viewerId || task.assignerId === viewerId)
  return {
    id: comment.id,
    author: personRef(comment.authorId),
    body: comment.hidden ? null : comment.body,
    attachments: comment.hidden ? [] : fileRefs(comment.attachmentIds),
    createdAt: comment.createdAt,
    hidden: comment.hidden ? { by: personRef(comment.hidden.by), at: comment.hidden.at } : null,
    allowedActions: canHide ? ['HIDE'] : [],
  }
}

export function toCommentList(task: DbTask, viewerId: string): TaskCommentList {
  return {
    comments: commentsOf(task.id).map((comment) => toTaskComment(comment, task, viewerId)),
    canComment: isTaskParticipant(task, viewerId) && commentBlocker(task) === null,
  }
}

/** Tệp tải được nếu thuộc kết quả đã nộp hoặc một bình luận chưa ẩn của việc. */
export function attachmentOfTask(task: DbTask, attachmentId: string) {
  const linked =
    task.submission?.attachmentIds.includes(attachmentId) === true ||
    db.taskComments.some((comment) => comment.taskId === task.id && comment.hidden === null && comment.attachmentIds.includes(attachmentId))
  return linked ? db.attachments.find((attachment) => attachment.id === attachmentId) : undefined
}
