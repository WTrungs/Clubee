import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { memberQueryKeys } from '@/features/member/viewModel/memberQueryKeys'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { validateImageFile } from '@/shared/lib/validateImageFile'
import { clubRepository } from '../model/clubRepository'
import type { ClubDetail } from '../model/clubTypes'
import { useCurrentClub } from './clubContext'
import { clubProfileSchema, toClubProfileValues, toUpdateClubRequest, type ClubProfileValues } from './clubSchemas'
import { clubQueryKeys } from './useClubDetail'

const SERVER_FIELDS = ['name', 'shortName', 'field', 'description', 'contactEmail', 'contactPhone', 'contactUrl', 'rules'] as const

/** Tên, logo CLB hiện ở danh bạ và bộ chọn CLB nên lưu xong làm mới cả hai. */
function useApplySavedClub() {
  const queryClient = useQueryClient()
  return (saved: ClubDetail) => {
    queryClient.setQueryData(clubQueryKeys.detail(saved.id), saved)
    void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    void queryClient.invalidateQueries({ queryKey: clubQueryKeys.directories })
  }
}

/** FR-CLB-02: ban chủ nhiệm sửa hồ sơ CLB; lệch `version` thì báo và cho tải lại, không ghi đè (NFR-REL-03). */
export function useClubProfileViewModel(onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId, club } = useCurrentClub()
  const applySaved = useApplySavedClub()
  const liveValues = useMemo(() => toClubProfileValues(club), [club])
  const form = useForm<ClubProfileValues>({ resolver: zodResolver(clubProfileSchema), defaultValues: liveValues })
  const baseline = useEditBaseline(form, club.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: ClubProfileValues) => clubRepository.update(clubId, toUpdateClubRequest(values, baseline.version())),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      baseline.accept(saved.version, toClubProfileValues(saved))
      applySaved(saved)
      // Cờ thu thập MSSV quyết định danh sách thành viên có hiện MSSV hay không.
      void queryClient.invalidateQueries({ queryKey: memberQueryKeys.all })
      toast.success('Đã lưu hồ sơ CLB.')
      onDone()
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS)),
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({ queryKey: clubQueryKeys.detail(clubId), queryFn: () => clubRepository.getClub(clubId), staleTime: 0 })
        const values = toClubProfileValues(fresh)
        baseline.accept(fresh.version, values)
        form.reset(values)
        mutation.reset()
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    errorMessage: mutation.error && !conflict && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}

/** Logo CLB: JPG, PNG, tối đa 15 MB (IF-05); kiểm tra ở client trước, máy chủ vẫn kiểm tra lại. */
export function useClubLogoUpload() {
  const { clubId } = useCurrentClub()
  const applySaved = useApplySavedClub()
  const [fileError, setFileError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (file: File) => clubRepository.uploadLogo(clubId, file),
    meta: { silentError: true },
    onSuccess: (saved) => {
      applySaved(saved)
      toast.success('Đã cập nhật logo CLB.')
    },
  })
  return {
    upload: (file: File | undefined) => {
      if (!file) return
      const problem = validateImageFile(file, 'Logo CLB')
      setFileError(problem)
      if (!problem) mutation.mutate(file)
    },
    pending: mutation.isPending,
    errorMessage: fileError ?? (mutation.error ? getErrorMessage(mutation.error) : null),
  }
}
