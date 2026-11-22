import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { getErrorMessage } from '@/api/apiError'
import { USE_MOCK } from '@/api/mockMode'
import { accountRepository } from '../model/accountRepository'
import { forgotPasswordSchema, type ForgotPasswordValues } from './accountSchemas'

/** Chế độ mock không gửi email thật: đọc liên kết vừa gửi từ hộp thư demo; bản build thật không chạy nhánh này. */
async function demoMailboxLink(email: string): Promise<string | null | undefined> {
  if (!USE_MOCK) return undefined
  const { latestResetLinkFor } = await import('@/api/mocks/mockPasswordResets')
  return latestResetLinkFor(email)
}

export function useForgotPasswordViewModel() {
  const form = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } })
  const mutation = useMutation({
    mutationFn: async (values: ForgotPasswordValues) => {
      await accountRepository.requestPasswordReset(values.email)
      return demoMailboxLink(values.email)
    },
    meta: { silentError: true, authRequest: true },
  })

  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    /** FR-ACC-03: liên kết dùng một lần; câu báo giống nhau dù email có tồn tại hay không. */
    sentTo: mutation.isSuccess ? mutation.variables.email : null,
    /** Chỉ có ở chế độ mock: `undefined` là không có hộp thư demo, `null` là không có thư nào được gửi. */
    demoResetLink: mutation.isSuccess ? mutation.data : undefined,
    reset: () => mutation.reset(),
  }
}
