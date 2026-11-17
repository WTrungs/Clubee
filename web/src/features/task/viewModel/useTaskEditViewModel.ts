import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { parseVnDateTime } from '@/shared/format/formatDate'
import { taskRepository } from '../model/taskRepository'
import type { AssignableMember, TaskDetail, UpdateTaskRequest } from '../model/taskTypes'
import { taskQueryKeys } from './taskQueryKeys'
import { changeDueDefaults, changeDueSchema, reassignChanged, reassignDefaults, reassignSchema, type ChangeDueValues, type ReassignValues } from './taskEditSchemas'

export type TaskEditMode = 'reassign' | 'due'

/** Người đang làm việc mà không còn trong phạm vi (ví dụ Tạm nghỉ) vẫn hiện để giữ hoặc bỏ, có ghi chú. */
export interface PersonOption extends AssignableMember {
  outOfScope: boolean
}

/** FR-TASK-05: đổi người, đổi hạn kèm lý do; chỉ báo xong khi máy chủ lưu, 409 thì tải lại việc (NFR-REL-03, 04). */
export function useTaskEditViewModel(task: TaskDetail | null) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<TaskEditMode | null>(null)
  // Giá trị form lúc bấm lưu mà chưa đổi gì; câu báo tự ẩn khi người dùng sửa ô.
  const [unchangedKey, setUnchangedKey] = useState<string | null>(null)
  // Giữ version lúc mở hộp: chi tiết có thể tải lại khi hộp còn mở, gửi lại vẫn phải gặp 409 nếu việc đã đổi (NFR-REL-03).
  const [openedVersion, setOpenedVersion] = useState(0)
  const scopes = useQuery({
    queryKey: taskQueryKeys.scopes(task?.clubId ?? ''),
    queryFn: () => taskRepository.assignableScopes(task?.clubId ?? ''),
    enabled: mode === 'reassign' && task !== null,
    staleTime: 0,
  })
  const reassignForm = useForm<ReassignValues>({ resolver: zodResolver(reassignSchema), defaultValues: { ownerId: '', collaboratorIds: [], reason: '' } })
  const dueForm = useForm<ChangeDueValues>({ resolver: zodResolver(changeDueSchema), defaultValues: { dueDate: '', dueTime: '', reason: '' } })
  const [ownerId, collaboratorIds] = useWatch({ control: reassignForm.control, name: ['ownerId', 'collaboratorIds'] })
  const [dueDate, dueTime] = useWatch({ control: dueForm.control, name: ['dueDate', 'dueTime'] })
  const formKey = mode === 'due' ? `due:${dueDate} ${dueTime}` : `people:${ownerId}|${collaboratorIds.toSorted().join(',')}`
  const noChange = unchangedKey !== null && unchangedKey === formKey

  const close = () => setMode(null)
  const mutation = useMutation({
    mutationFn: (request: Omit<UpdateTaskRequest, 'version'>) => {
      if (!task) throw new Error('Chưa chọn công việc.')
      return taskRepository.update(task.clubId, task.id, { ...request, version: openedVersion })
    },
    meta: { silentError: true },
    onSuccess: async (saved) => {
      queryClient.setQueryData(taskQueryKeys.detail(saved.clubId, saved.id), saved)
      await queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
      toast.success(mode === 'due' ? 'Đã đổi hạn công việc.' : 'Đã đổi người làm công việc.')
      close()
    },
    onError: (error) => {
      if (isConflict(error) && task) {
        // Người khác vừa sửa: đóng hộp, báo và tải bản mới thay vì ghi đè.
        toast.error(getErrorMessage(error))
        close()
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.clubId, task.id) })
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
        return
      }
      if (!(error instanceof ApiError)) return
      // Mất quyền hoặc việc đã đổi trạng thái: tải lại để menu, cột thả trên bảng chỉ còn thao tác hợp lệ.
      if (task && (error.status === 403 || error.status === 422)) {
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.clubId, task.id) })
        void queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
      }
      for (const fieldError of error.fieldErrors) {
        if (fieldError.field === 'reason') (mode === 'due' ? dueForm : reassignForm).setError('reason', { type: 'server', message: fieldError.message })
        if (fieldError.field === 'dueAt') dueForm.setError('dueDate', { type: 'server', message: fieldError.message })
        if (fieldError.field === 'ownerId' || fieldError.field === 'collaboratorIds') reassignForm.setError(fieldError.field, { type: 'server', message: fieldError.message })
      }
    },
  })

  const scope = task ? (scopes.data?.find((candidate) => candidate.type === task.scope.type && candidate.id === task.scope.id) ?? null) : null
  const members = scope?.members ?? []
  const inScope = (id: string) => members.some((member) => member.id === id)
  const keep = (person: { id: string; fullName: string }): PersonOption => ({ id: person.id, fullName: person.fullName, departmentName: null, outOfScope: true })
  const ownerOptions: PersonOption[] = [
    ...members.map((member) => ({ ...member, outOfScope: false })),
    ...(task && !inScope(task.owner.id) ? [keep(task.owner)] : []),
  ]
  const collaboratorOptions: PersonOption[] = [
    ...members.map((member) => ({ ...member, outOfScope: false })),
    ...(task?.collaborators.filter((person) => !inScope(person.id)).map(keep) ?? []),
  ].filter((option) => option.id !== ownerId)

  const error = mutation.error
  const fieldErrorsShown = error instanceof ApiError && error.fieldErrors.length > 0
  return {
    mode,
    open: (next: TaskEditMode) => {
      if (!task) return
      mutation.reset()
      setUnchangedKey(null)
      setOpenedVersion(task.version)
      if (next === 'reassign') reassignForm.reset(reassignDefaults(task))
      else dueForm.reset(changeDueDefaults(task))
      setMode(next)
    },
    close: () => {
      if (!mutation.isPending) close()
    },
    reassignForm,
    dueForm,
    scopeLoading: scopes.isPending && mode === 'reassign',
    scopeError: scopes.error,
    retryScope: () => void scopes.refetch(),
    /** Phạm vi không còn trong danh sách giao việc của người gọi (ban đóng, mất quyền): không chọn người được. */
    scopeUnavailable: mode === 'reassign' && scopes.isSuccess && scope === null,
    ownerId,
    collaboratorIds,
    ownerOptions,
    collaboratorOptions,
    selectOwner: (id: string) => {
      reassignForm.setValue('ownerId', id, { shouldValidate: true })
      reassignForm.setValue(
        'collaboratorIds',
        collaboratorIds.filter((item) => item !== id),
      )
    },
    toggleCollaborator: (id: string) => {
      reassignForm.setValue('collaboratorIds', collaboratorIds.includes(id) ? collaboratorIds.filter((item) => item !== id) : [...collaboratorIds, id], {
        shouldValidate: true,
      })
    },
    submitReassign: reassignForm.handleSubmit((values) => {
      const unchanged = !task || !reassignChanged(task, values)
      setUnchangedKey(unchanged ? formKey : null)
      if (!unchanged) mutation.mutate({ ownerId: values.ownerId, collaboratorIds: values.collaboratorIds, reason: values.reason })
    }),
    submitDue: dueForm.handleSubmit((values) => {
      const dueAt = parseVnDateTime(values.dueDate, values.dueTime) ?? ''
      const unchanged = !task || Date.parse(dueAt) === Date.parse(task.dueAt)
      setUnchangedKey(unchanged ? formKey : null)
      if (!unchanged) mutation.mutate({ dueAt, reason: values.reason })
    }),
    pending: mutation.isPending,
    errorMessage: noChange ? 'Chưa có thay đổi nào so với hiện tại.' : error && !isConflict(error) && !fieldErrorsShown ? getErrorMessage(error) : null,
  }
}

export type TaskEditViewModel = ReturnType<typeof useTaskEditViewModel>
