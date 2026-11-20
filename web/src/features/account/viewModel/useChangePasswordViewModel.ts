import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { accountRepository } from '../model/accountRepository'
import { changePasswordSchema, type ChangePasswordValues } from './profileSchemas'

const SERVER_FIELDS = ['currentPassword', 'newPassword'] as const

/** FR-ACC-04: cần mật khẩu cũ; máy chủ thu hồi các phiên khác, phiên đang dùng giữ nguyên. */
export function useChangePasswordViewModel() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  const mutation = useMutation({
    mutationFn: (values: ChangePasswordValues) => accountRepository.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: () => {
      form.reset()
      toast.success('Đã đổi mật khẩu. Các phiên đăng nhập trên thiết bị khác đã bị đăng xuất.')
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
