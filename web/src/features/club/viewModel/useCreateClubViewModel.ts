import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { clubRepository } from '../model/clubRepository'
import { createClubSchema, toCreateClubRequest, type CreateClubValues } from './clubSchemas'
import { clubQueryKeys } from './useClubDetail'

const SERVER_FIELDS = ['name', 'shortName', 'field', 'description'] as const

/** FR-CLB-01: tạo xong thì người tạo là Chủ nhiệm, vào thẳng CLB mới. */
export function useCreateClubViewModel(onDone: () => void) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<CreateClubValues>({ resolver: zodResolver(createClubSchema), defaultValues: { name: '', shortName: '', field: '', description: '' } })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: CreateClubValues) => clubRepository.create(toCreateClubRequest(values)),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (club) => {
      queryClient.setQueryData(clubQueryKeys.detail(club.id), club)
      await Promise.all([queryClient.invalidateQueries({ queryKey: sessionQueryKey }), queryClient.invalidateQueries({ queryKey: clubQueryKeys.directories })])
      toast.success(`Đã tạo ${club.name}. Bạn là Chủ nhiệm của nhiệm kỳ đầu tiên.`)
      onDone()
      void navigate(`/clubs/${encodeURIComponent(club.id)}`)
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS)),
  })

  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}
