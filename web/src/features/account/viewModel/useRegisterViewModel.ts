import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { getErrorMessage } from '@/api/apiError'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { accountRepository } from '../model/accountRepository'
import { passwordStrength, registerSchema, type RegisterValues } from './accountSchemas'

const SERVER_FIELDS = ['fullName', 'email', 'password'] as const

export function useRegisterViewModel() {
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: RegisterValues) =>
      accountRepository.register({ fullName: values.fullName, email: values.email, password: values.password }),
    meta: { silentError: true, authRequest: true },
    onMutate: () => setFieldErrorsApplied(false),
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
    },
  })

  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    /** Lỗi chung; lỗi đã gắn được vào ô nào (ví dụ email trùng) thì không lặp lại ở đây. */
    errorMessage: mutation.error && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
    /** FR-ACC-01: tài khoản ở Chờ xác thực cho đến khi bấm liên kết trong email. */
    registeredEmail: mutation.data?.email ?? null,
    strength: passwordStrength(password),
  }
}
