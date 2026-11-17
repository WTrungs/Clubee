import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { toVnDateKey } from '@/shared/format/formatDate'
import { validateImageFile } from '@/shared/lib/validateImageFile'
import { accountRepository } from '../model/accountRepository'
import type { Profile } from '../model/accountTypes'
import { emailChangeSchema, profileSchema, toProfileValues, toUpdateProfileRequest, type EmailChangeValues, type ProfileValues } from './profileSchemas'

export const profileQueryKey = ['profile'] as const

const PROFILE_FIELDS = ['fullName', 'phone', 'birthDate'] as const
const EMAIL_FIELDS = ['newEmail', 'currentPassword'] as const

/** FR-ACC-05: hồ sơ dùng chung cho mọi CLB. */
export function useProfile() {
  return useQuery({ queryKey: profileQueryKey, queryFn: accountRepository.getProfile })
}

/** Sửa họ tên, SĐT, ngày sinh; dữ liệu đã đổi ở nơi khác thì báo và cho tải lại, không ghi đè (NFR-REL-03). */
export function useProfileInfoForm(profile: Profile) {
  const queryClient = useQueryClient()
  // Lấy ngày hôm nay một lần khi mở trang, không gọi Date trong lúc render.
  const [today] = useState(() => toVnDateKey(new Date()))
  const schema = useMemo(() => profileSchema(today), [today])
  const liveValues = useMemo(() => toProfileValues(profile), [profile])
  const form = useForm<ProfileValues>({ resolver: zodResolver(schema), defaultValues: liveValues })
  const baseline = useEditBaseline(form, profile.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) => accountRepository.updateProfile(toUpdateProfileRequest(values, baseline.version())),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      const values = toProfileValues(saved)
      baseline.accept(saved.version, values)
      queryClient.setQueryData(profileQueryKey, saved)
      form.reset(values)
      toast.success('Đã lưu thông tin cá nhân.')
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, PROFILE_FIELDS)),
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    dirty: form.formState.isDirty,
    conflict,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({ queryKey: profileQueryKey, queryFn: accountRepository.getProfile, staleTime: 0 })
        const values = toProfileValues(fresh)
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

/** Ảnh đại diện: kiểm tra định dạng, dung lượng ở client trước khi gửi (IF-05), máy chủ vẫn kiểm tra lại. */
export function useAvatarUpload() {
  const queryClient = useQueryClient()
  const [fileError, setFileError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: accountRepository.uploadAvatar,
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(profileQueryKey, saved)
      toast.success('Đã cập nhật ảnh đại diện.')
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
  })
  return {
    upload: (file: File | undefined) => {
      if (!file) return
      const problem = validateImageFile(file, 'Ảnh đại diện')
      setFileError(problem)
      if (!problem) mutation.mutate(file)
    },
    pending: mutation.isPending,
    errorMessage: fileError ?? (mutation.error ? getErrorMessage(mutation.error) : null),
  }
}

/** Đổi email phải xác thực lại: email cũ vẫn dùng đến khi người dùng mở liên kết gửi tới email mới (FR-ACC-05). */
export function useEmailChangeForm() {
  const queryClient = useQueryClient()
  const form = useForm<EmailChangeValues>({ resolver: zodResolver(emailChangeSchema), defaultValues: { newEmail: '', currentPassword: '' } })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  const mutation = useMutation({
    mutationFn: accountRepository.requestEmailChange,
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (receipt) => {
      form.reset()
      await queryClient.invalidateQueries({ queryKey: profileQueryKey })
      toast.success(`Đã gửi liên kết xác thực tới ${receipt.pendingEmail}.`)
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, EMAIL_FIELDS)),
  })
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}
