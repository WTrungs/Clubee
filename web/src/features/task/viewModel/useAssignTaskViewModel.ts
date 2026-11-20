import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { formatDate, parseVnDateTime } from '@/shared/format/formatDate'
import { taskRepository } from '../model/taskRepository'
import type { TaskScopeType } from '../model/taskTypes'
import { assignTaskSchema, scopeKeyOf, type AssignTaskValues } from './assignTaskSchema'
import { taskQueryKeys } from './taskQueryKeys'

const DAY_MS = 24 * 60 * 60 * 1000

function defaultValues(): AssignTaskValues {
  return {
    title: '',
    description: '',
    scopeKey: '',
    ownerId: '',
    collaboratorIds: [],
    dueDate: formatDate(new Date(Date.now() + 3 * DAY_MS)),
    dueTime: '21:00',
    priority: 'MEDIUM',
  }
}

/** FR-TASK-01: giao việc trong phạm vi chức vụ; người nhận lấy từ danh sách máy chủ trả cho phạm vi đó. */
export function useAssignTaskViewModel(clubId: string, onDone: () => void) {
  const queryClient = useQueryClient()
  const scopes = useQuery({ queryKey: taskQueryKeys.scopes(clubId), queryFn: () => taskRepository.assignableScopes(clubId) })
  const form = useForm<AssignTaskValues>({ resolver: zodResolver(assignTaskSchema), defaultValues: defaultValues() })
  const [scopeKey, ownerId, collaboratorIds, priority] = useWatch({
    control: form.control,
    name: ['scopeKey', 'ownerId', 'collaboratorIds', 'priority'],
  })
  const scope = scopes.data?.find((candidate) => scopeKeyOf(candidate) === scopeKey) ?? null

  const mutation = useMutation({
    mutationFn: (values: AssignTaskValues) => {
      const [scopeType, scopeId] = values.scopeKey.split(':') as [TaskScopeType, string]
      return taskRepository.create(clubId, {
        title: values.title,
        description: values.description,
        scopeType,
        scopeId,
        ownerId: values.ownerId,
        collaboratorIds: values.collaboratorIds,
        dueAt: parseVnDateTime(values.dueDate, values.dueTime) ?? '',
        priority: values.priority,
      })
    },
    meta: { silentError: true },
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists })
      toast.success(`Đã giao “${task.title}” cho ${task.owner.fullName}.`)
      form.reset(defaultValues())
      onDone()
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) {
        const field = fieldError.field === 'dueAt' ? 'dueDate' : fieldError.field
        if (field === 'title' || field === 'ownerId' || field === 'collaboratorIds' || field === 'dueDate' || field === 'priority') {
          form.setError(field, { type: 'server', message: fieldError.message })
        }
      }
    },
  })

  const error = mutation.error
  return {
    form,
    scopes: scopes.data ?? [],
    scopesLoading: scopes.isPending,
    scopesError: scopes.error,
    canAssign: (scopes.data?.length ?? 0) > 0,
    members: scope?.members ?? [],
    collaboratorCandidates: (scope?.members ?? []).filter((member) => member.id !== ownerId),
    scopeKey,
    ownerId,
    collaboratorIds,
    priority,
    selectScope: (key: string) => {
      form.setValue('scopeKey', key, { shouldValidate: true })
      form.setValue('ownerId', '')
      form.setValue('collaboratorIds', [])
    },
    selectOwner: (id: string) => {
      form.setValue('ownerId', id, { shouldValidate: true })
      form.setValue(
        'collaboratorIds',
        collaboratorIds.filter((item) => item !== id),
      )
    },
    toggleCollaborator: (id: string) =>
      form.setValue('collaboratorIds', collaboratorIds.includes(id) ? collaboratorIds.filter((item) => item !== id) : [...collaboratorIds, id], {
        shouldValidate: true,
      }),
    setDueInDays: (days: number) => form.setValue('dueDate', formatDate(new Date(Date.now() + days * DAY_MS)), { shouldValidate: true }),
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(error instanceof ApiError && error.fieldErrors.length > 0) ? getErrorMessage(error) : null,
    reset: () => {
      form.reset(defaultValues())
      mutation.reset()
    },
  }
}
