import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isUnauthorized } from './apiError'

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: Error
    mutationMeta: {
      /** Màn hình tự hiển thị lỗi (ví dụ banner 409), không cần toast chung. */
      silentError?: boolean
      /** Request đăng nhập, đăng ký: 401 ở đây là sai thông tin, không phải hết phiên. */
      authRequest?: boolean
    }
  }
}

export const sessionQueryKey = ['session'] as const

/** Bỏ mọi dữ liệu của người dùng trước đó (trừ phiên) để tài khoản sau không thấy cache cũ (SRS 3.5, BR-SEC-01). */
export function clearUserScopedQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] })
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isUnauthorized(error) && query.queryKey[0] !== sessionQueryKey[0]) {
          void client.invalidateQueries({ queryKey: sessionQueryKey })
        }
      },
      onSuccess: (data, query) => {
        // The session resolved to nobody (logged out or expired): drop everything the previous user loaded.
        if (query.queryKey[0] === sessionQueryKey[0] && data === null) clearUserScopedQueries(client)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        if (isUnauthorized(error) && !mutation.meta?.authRequest) void client.invalidateQueries({ queryKey: sessionQueryKey })
        if (!mutation.meta?.silentError) toast.error(getErrorMessage(error))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const clientError = error instanceof ApiError && error.status >= 400 && error.status < 500
          return !clientError && failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
  return client
}
