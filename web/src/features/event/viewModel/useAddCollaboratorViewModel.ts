import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { isEmail } from '@/shared/lib/contactRules'
import { eventRepository } from '../model/eventRepository'
import type { Subcommittee } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

export const collaboratorSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Nhập email tài khoản của người cần thêm.')
    .max(254, 'Email tối đa 254 ký tự.')
    .refine((value) => value === '' || isEmail(value), 'Email không hợp lệ.'),
})
export type CollaboratorValues = z.infer<typeof collaboratorSchema>

const empty: CollaboratorValues = { email: '' }

/** FR-EVT-07: Trưởng BTC thêm người ngoài CLB làm CTV bằng email tài khoản; người đó vào tiểu ban ngay. */
export function useAddCollaboratorViewModel(clubId: string, eventId: string) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<Subcommittee | null>(null)
  const form = useForm<CollaboratorValues>({ resolver: zodResolver(collaboratorSchema), defaultValues: empty })

  const add = useMutation({
    mutationFn: ({ subcommitteeId, email }: { subcommitteeId: string; email: string }) => eventRepository.addCollaborator(clubId, eventId, subcommitteeId, email),
    meta: { silentError: true },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      toast.success(`Đã thêm cộng tác viên vào tiểu ban ${updated.name}.`)
      form.reset(empty)
      setTarget(null)
    },
    onError: (error) => {
      // Người khác vừa thêm người này thì tải lại để thẻ tiểu ban hiện đúng (NFR-REL-03).
      if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      // Lỗi về email (sai dạng, không có tài khoản, đang là thành viên) gắn vào ô, kèm câu đầy đủ của máy chủ.
      if (error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.field === 'email')) {
        form.setError('email', { type: 'server', message: getErrorMessage(error) })
      }
    },
  })

  const error = add.error
  return {
    target,
    open: (subcommittee: Subcommittee) => {
      add.reset()
      form.reset(empty)
      setTarget(subcommittee)
    },
    close: () => {
      if (add.isPending) return
      setTarget(null)
    },
    form,
    submit: form.handleSubmit((values) => {
      if (target) add.mutate({ subcommitteeId: target.id, email: values.email })
    }),
    submitting: add.isPending,
    formError: error && !(error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.field === 'email')) ? getErrorMessage(error) : null,
  }
}

export type AddCollaboratorViewModel = ReturnType<typeof useAddCollaboratorViewModel>
