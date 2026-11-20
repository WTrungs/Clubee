import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router'
import { getErrorMessage } from '@/api/apiError'
import { demoAccounts } from '@/api/mocks/demoAccounts'
import { USE_MOCK } from '@/api/mockMode'
import { clearUserScopedQueries, sessionQueryKey } from '@/api/queryClient'
import { accountRepository } from '../model/accountRepository'
import { loginSchema, type LoginValues } from './accountSchemas'
import { resolveRedirect } from './redirect'

export function useLoginViewModel() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const mutation = useMutation({
    mutationFn: accountRepository.login,
    meta: { silentError: true, authRequest: true },
    onSuccess: (user) => {
      // Xóa dữ liệu của tài khoản trước rồi mới ghi phiên mới, để trang sau không thấy cache cũ.
      clearUserScopedQueries(queryClient)
      queryClient.setQueryData(sessionQueryKey, user)
      void navigate(resolveRedirect(location.state, user.accountType), { replace: true })
    },
  })

  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    demoAccounts: USE_MOCK ? demoAccounts : [],
    pickDemoAccount: (email: string) => {
      form.setValue('email', email, { shouldValidate: true })
      form.setFocus('password')
    },
  }
}
