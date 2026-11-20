import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { taskRepository } from '../model/taskRepository'
import type { TaskSummary, TaskTransitionAction } from '../model/taskTypes'
import { actionInput, actionSuccessMessage } from './taskDisplay'
import { taskQueryKeys } from './taskQueryKeys'

type TaskRef = Pick<TaskSummary, 'id' | 'clubId' | 'version' | 'title'>

export interface TransitionInput {
  task: TaskRef
  action: TaskTransitionAction
  note?: string
  reason?: string
  files?: File[]
}

/** Chuyển trạng thái việc: danh sách chỉ đổi khi máy chủ xác nhận (NFR-REL-04), 409 bật banner tải lại (NFR-REL-03). */
export function useTaskTransition() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ task: TaskRef; action: TaskTransitionAction } | null>(null)
  const [conflict, setConflict] = useState(false)

  const mutation = useMutation({
    mutationFn: async ({ task, action, note, reason, files = [] }: TransitionInput) => {
      const attachmentIds: string[] = []
      for (const file of files) attachmentIds.push((await taskRepository.uploadAttachment(task.clubId, task.id, file)).id)
      return taskRepository.transition(task.clubId, task.id, { action, version: task.version, note, reason, attachmentIds })
    },
    meta: { silentError: true },
    onSuccess: async (detail, input) => {
      queryClient.setQueryData(taskQueryKeys.detail(detail.clubId, detail.id), detail)
      // Keep the card in its pending state until the lists show the server-confirmed status.
      await queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
      setDialog(null)
      toast.success(actionSuccessMessage[input.action])
    },
    onError: (error, input) => {
      if (isConflict(error)) {
        setDialog(null)
        setConflict(true)
        // Banner nằm sau sheet chi tiết nên báo thêm toast và tải lại chi tiết việc.
        toast.error(getErrorMessage(error))
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(input.task.clubId, input.task.id) })
        return
      }
      toast.error(getErrorMessage(error))
      // Mất quyền hoặc việc đã đổi trạng thái: tải lại để menu, nút chỉ còn thao tác hợp lệ.
      if (error instanceof ApiError && (error.status === 403 || error.status === 422)) {
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(input.task.clubId, input.task.id) })
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
      }
    },
  })

  return {
    /** Thao tác không cần nhập thêm thì gửi ngay; còn lại mở hộp thoại tương ứng. */
    requestAction: (task: TaskRef, action: TaskTransitionAction) => {
      if (mutation.isPending) return
      if (actionInput[action] === 'none') mutation.mutate({ task, action })
      else setDialog({ task, action })
    },
    dialog,
    closeDialog: () => {
      if (!mutation.isPending) setDialog(null)
    },
    confirmDialog: (payload: Pick<TransitionInput, 'note' | 'reason' | 'files'>) => {
      if (dialog) mutation.mutate({ ...dialog, ...payload })
    },
    pending: mutation.isPending,
    pendingTaskId: mutation.isPending ? (mutation.variables?.task.id ?? null) : null,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void queryClient.invalidateQueries({ queryKey: taskQueryKeys.all })
    },
  }
}

export type TaskTransitionController = ReturnType<typeof useTaskTransition>
