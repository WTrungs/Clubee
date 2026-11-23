import { http, HttpResponse } from 'msw'
import type { CreateTaskCommentRequest } from '@/features/task/model/taskTypes'
import { db } from '../db'
import { API, currentUser, downloadResponse, networkDelay, newId, problem, writer } from '../mockHttp'
import { personRef } from '../mockMembers'
import { notify, taskTarget } from '../mockNotifications'
import { canViewTask } from '../mockScopes'
import { attachmentOfTask, COMMENT_FILES_MAX, COMMENT_MAX, commentBlocker, isTaskParticipant, toCommentList, toTaskComment } from '../mockTaskComments'
import { nowIso } from '../mockTime'

type Params = Record<string, string | readonly string[] | undefined>

const taskOf = (params: Params) => db.tasks.find((task) => task.id === params.taskId && task.clubId === params.clubId)
const taskNotFound = () => problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
const cannotView = () => problem(403, 'Bạn không xem được công việc này.', 'FORBIDDEN')

// FR-TASK-07: bình luận công việc; người xem được việc thì đọc được, người giao, người chính, người phối hợp viết được.
export const taskCommentHandlers = [
  http.get(`${API}/clubs/:clubId/tasks/:taskId/comments`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const task = taskOf(params)
    if (!task) return taskNotFound()
    if (!canViewTask(task, user.value.id)) return cannotView()
    return HttpResponse.json(toCommentList(task, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/tasks/:taskId/comments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const task = taskOf(params)
    if (!task) return taskNotFound()
    if (!canViewTask(task, user.value.id) || !isTaskParticipant(task, user.value.id)) {
      return problem(403, 'Chỉ người giao, người chính và người phối hợp bình luận được.', 'FORBIDDEN')
    }
    const blocked = commentBlocker(task)
    if (blocked) return problem(422, blocked, task.status === 'CANCELLED' ? 'TASK_CANCELLED' : 'EVENT_READ_ONLY')
    const body = (await request.json()) as Partial<CreateTaskCommentRequest>
    const text = (body.body ?? '').trim()
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter((id): id is string => typeof id === 'string') : []
    const used = new Set(db.taskComments.flatMap((comment) => comment.attachmentIds))
    const ownFiles = attachmentIds.every((id) => db.attachments.some((attachment) => attachment.id === id && attachment.uploadedBy === user.value.id) && !used.has(id))
    const errors = [
      ...(text.length < 1 || text.length > COMMENT_MAX ? [{ field: 'body', message: `Bình luận cần từ 1 đến ${COMMENT_MAX} ký tự.` }] : []),
      ...(attachmentIds.length > COMMENT_FILES_MAX ? [{ field: 'attachmentIds', message: `Đính kèm tối đa ${COMMENT_FILES_MAX} tệp.` }] : []),
      ...(!ownFiles ? [{ field: 'attachmentIds', message: 'Tệp đính kèm không hợp lệ; tải tệp lên lại.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Bình luận chưa hợp lệ.', 'VALIDATION', errors)
    const comment = { id: newId('cm'), taskId: task.id, authorId: user.value.id, body: text, attachmentIds, createdAt: nowIso(), hidden: null }
    db.taskComments.push(comment)
    notify([task.assignerId, task.ownerId, ...task.collaboratorIds], {
      clubId: task.clubId,
      category: 'TASK',
      title: `${personRef(user.value.id).fullName} bình luận: ${task.title}`,
      body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
      target: taskTarget(task.clubId, task.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toTaskComment(comment, task, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/tasks/:taskId/comments/:commentId/hiding`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const task = taskOf(params)
    const comment = db.taskComments.find((candidate) => candidate.id === params.commentId && candidate.taskId === params.taskId)
    if (!task || !comment) return problem(404, 'Không tìm thấy bình luận.', 'COMMENT_NOT_FOUND')
    if (!canViewTask(task, user.value.id) || (comment.authorId !== user.value.id && task.assignerId !== user.value.id)) {
      return problem(403, 'Chỉ người viết hoặc người giao việc ẩn được bình luận.', 'FORBIDDEN')
    }
    if (comment.hidden) return problem(422, 'Bình luận đã được ẩn.', 'COMMENT_HIDDEN')
    const blocked = commentBlocker(task)
    if (blocked) return problem(422, blocked, 'EVENT_READ_ONLY')
    comment.hidden = { by: user.value.id, at: nowIso() }
    return HttpResponse.json(toTaskComment(comment, task, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/tasks/:taskId/attachments/:attachmentId/file`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const task = taskOf(params)
    if (!task) return taskNotFound()
    if (!canViewTask(task, user.value.id)) return cannotView()
    const attachment = attachmentOfTask(task, String(params.attachmentId))
    if (!attachment) return problem(404, 'Không tìm thấy tệp.', 'FILE_NOT_FOUND')
    const stored = db.attachmentFiles.find((file) => file.attachmentId === attachment.id)
    const file = stored?.file ?? new Blob([`Tệp mẫu: ${attachment.name}\n`], { type: attachment.contentType })
    return downloadResponse(file, attachment.name, attachment.contentType || 'application/octet-stream')
  }),
]
