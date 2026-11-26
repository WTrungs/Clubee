import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { sessionQueryKey } from '@/api/queryClient'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { accountRepository } from '../model/accountRepository'
import type { PasswordResetLink } from '../model/accountTypes'
import { passwordStrength, resetPasswordSchema, type ResetPasswordValues } from './accountSchemas'

export type ResetPageState = 'missing' | 'checking' | 'error' | 'notFound' | 'valid' | 'expired' | 'used' | 'done'

interface ResetPageInput {
  token: string
  done: boolean
  link: PasswordResetLink | undefined
  error: unknown
}

/** Màn hình của trang đặt lại mật khẩu, suy từ token trên URL và kết quả kiểm liên kết của máy chủ. */
export function resetPageState({ token, done, link, error }: ResetPageInput): ResetPageState {
  if (done) return 'done'
  if (token === '') return 'missing'
  if (error instanceof ApiError && error.status === 404) return 'notFound'
  if (error) return 'error'
  if (!link) return 'checking'
  if (link.status === 'EXPIRED') return 'expired'
  if (link.status === 'USED') return 'used'
  return 'valid'
}

const SERVER_FIELDS = ['newPassword'] as const
const STALE_LINK_CODES = ['RESET_LINK_EXPIRED', 'RESET_LINK_USED', 'RESET_LINK_NOT_FOUND']

/** FR-ACC-03: kiểm liên kết rồi đặt mật khẩu mới; máy chủ thu hồi mọi phiên của tài khoản nên làm mới phiên. */
export function useResetPasswordViewModel() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') ?? '').trim()
  const queryClient = useQueryClient()
  const link = useQuery({
    queryKey: ['passwordResetLink', token],
    queryFn: () => accountRepository.getPasswordResetLink(token),
    enabled: token !== '',
    // Liên kết đổi trạng thái theo thời gian và theo lần dùng, nên mỗi lần mở trang đều hỏi lại máy chủ.
    staleTime: 0,
    gcTime: 0,
  })
  const form = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { newPassword: '', confirmPassword: '' } })
  const password = useWatch({ control: form.control, name: 'newPassword' })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordValues) => accountRepository.completePasswordReset(token, { newPassword: values.newPassword }),
    meta: { silentError: true, authRequest: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: () => {
      form.reset()
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
      // Liên kết vừa hết hạn hoặc vừa được dùng ở nơi khác: kiểm lại để trang nêu đúng trạng thái.
      if (error instanceof ApiError && STALE_LINK_CODES.includes(error.code)) void link.refetch()
    },
  })

  return {
    state: resetPageState({ token, done: mutation.isSuccess, link: link.data, error: link.error }),
    emailHint: link.data?.emailHint ?? null,
    expiresAt: link.data?.expiresAt ?? null,
    linkError: link.error,
    retry: () => void link.refetch(),
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
    strength: passwordStrength(password),
  }
}
