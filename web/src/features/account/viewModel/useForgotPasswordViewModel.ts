import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { getErrorMessage } from '@/api/apiError'
import { accountRepository } from '../model/accountRepository'
import { forgotPasswordSchema, type ForgotPasswordValues } from './accountSchemas'

export function useForgotPasswordViewModel() {
  const form = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } })
  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) => accountRepository.requestPasswordReset(values.email),
    meta: { silentError: true, authRequest: true },
  })

  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    /** FR-ACC-03: liên kết dùng một lần; câu báo giống nhau dù email có tồn tại hay không. */
    sentTo: mutation.isSuccess ? mutation.variables.email : null,
    reset: () => mutation.reset(),
  }
}
