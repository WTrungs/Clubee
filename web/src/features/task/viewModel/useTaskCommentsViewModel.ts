import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { saveBlob } from '@/shared/lib/saveBlob'
import { taskRepository } from '../model/taskRepository'
import type { TaskComment, TaskDetail } from '../model/taskTypes'
import { taskQueryKeys } from './taskQueryKeys'

export const COMMENT_MAX = 2000

/** Tải một tệp của việc (kết quả đã nộp hoặc bình luận); quyền xem kiểm lại ở máy chủ mỗi lần. */
export function useTaskAttachmentDownload(clubId: string, taskId: string) {
  const download = useMutation({
    mutationFn: (file: { id: string; name: string }) => taskRepository.downloadAttachment(clubId, taskId, file.id),
    meta: { silentError: true },
    onSuccess: ({ blob, fileName }, file) => saveBlob(blob, fileName ?? file.name),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return {
    download: (file: { id: string; name: string }) => download.mutate(file),
    downloadingId: download.isPending ? (download.variables?.id ?? null) : null,
  }
}

/** FR-TASK-07: đọc, viết bình luận kèm tệp; người viết hoặc người giao ẩn được, không xóa. */
export function useTaskCommentsViewModel(task: Pick<TaskDetail, 'id' | 'clubId'>) {
  const queryClient = useQueryClient()
  const key = taskQueryKeys.comments(task.clubId, task.id)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [touched, setTouched] = useState(false)
  const [hiding, setHiding] = useState<TaskComment | null>(null)
  const list = useQuery({ queryKey: key, queryFn: () => taskRepository.comments(task.clubId, task.id) })
  const add = useMutation({
    mutationFn: async () => {
      const attachmentIds: string[] = []
      for (const file of files) attachmentIds.push((await taskRepository.uploadAttachment(task.clubId, task.id, file)).id)
      return taskRepository.addComment(task.clubId, task.id, { body: body.trim(), attachmentIds })
    },
    meta: { silentError: true },
    onSuccess: () => {
      setBody('')
      setFiles([])
      setTouched(false)
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const hide = useMutation({
    mutationFn: (comment: TaskComment) => taskRepository.hideComment(task.clubId, task.id, comment.id),
    meta: { silentError: true },
    onSuccess: () => {
      setHiding(null)
      toast.success('Đã ẩn bình luận.')
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const trimmed = body.trim()
  return {
    comments: list.data?.comments ?? [],
    canComment: list.data?.canComment ?? false,
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    body,
    setBody,
    bodyMax: COMMENT_MAX,
    bodyError: touched && trimmed.length === 0 ? 'Nhập nội dung bình luận.' : undefined,
    files,
    setFiles,
    submit: () => {
      setTouched(true)
      if (trimmed.length === 0 || trimmed.length > COMMENT_MAX) return
      add.mutate()
    },
    sending: add.isPending,
    sendError: add.error ? getErrorMessage(add.error) : null,
    hiding,
    setHiding,
    confirmHide: () => hiding && hide.mutate(hiding),
    hidePending: hide.isPending,
  }
}
