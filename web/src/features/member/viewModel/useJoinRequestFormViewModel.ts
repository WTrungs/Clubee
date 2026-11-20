import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { memberRepository } from '../model/memberRepository'
import { joinRequestSchema, type JoinRequestValues } from './joinRequestSchema'
import { memberQueryKeys } from './memberQueryKeys'

const SERVER_FIELDS = ['introduction', 'studentId'] as const
const emptyValues: JoinRequestValues = { introduction: '', studentId: '' }

export interface JoinTarget {
  id: string
  name: string
  collectsStudentId: boolean
  /** Gửi từ trang lời mời (FR-MEM-01). */
  invitationToken?: string
}

/** FR-MEM-02: gửi yêu cầu gia nhập, tạo tư cách Chờ duyệt; chỉ báo thành công khi máy chủ xác nhận (NFR-REL-04). */
export function useJoinRequestFormViewModel(target: JoinTarget | null, onDone: () => void) {
  const queryClient = useQueryClient()
  const collectsStudentId = target?.collectsStudentId ?? false
  const schema = useMemo(() => joinRequestSchema(collectsStudentId), [collectsStudentId])
  const form = useForm<JoinRequestValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: JoinRequestValues) => {
      if (!target) throw new Error('No club selected')
      return memberRepository.requestToJoin(target.id, {
        introduction: values.introduction,
        studentId: collectsStudentId ? values.studentId : undefined,
        invitationToken: target.invitationToken,
      })
    },
    meta: { silentError: true },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clubQueryKeys.directories }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
        ...(target?.invitationToken ? [queryClient.invalidateQueries({ queryKey: memberQueryKeys.invitationPreview(target.invitationToken) })] : []),
      ])
      toast.success(`Đã gửi yêu cầu gia nhập ${target?.name ?? 'CLB'}. Ban chủ nhiệm sẽ xem xét.`)
      form.reset(emptyValues)
      onDone()
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
      // Đã có tư cách ở CLB này (BR-MEM-01) hoặc lời mời vừa hết hiệu lực: tải lại để trang hiện đúng trạng thái.
      if (isConflict(error) || (error instanceof ApiError && error.status === 422)) {
        void queryClient.invalidateQueries({ queryKey: clubQueryKeys.directories })
        void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        if (target?.invitationToken) void queryClient.invalidateQueries({ queryKey: memberQueryKeys.invitationPreview(target.invitationToken) })
      }
    },
  })

  const error = mutation.error
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
    reset: () => {
      form.reset(emptyValues)
      mutation.reset()
      setFieldErrorsApplied(false)
    },
  }
}
