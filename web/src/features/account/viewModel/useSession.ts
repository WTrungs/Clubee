import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { isUnauthorized } from '@/api/apiError'
import { clearUserScopedQueries, sessionQueryKey } from '@/api/queryClient'
import { accountRepository } from '../model/accountRepository'
import type { CurrentUser } from '../model/accountTypes'

/** Phiên hiện tại: null nghĩa là chưa đăng nhập (máy chủ trả 401). */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<CurrentUser | null> => {
      try {
        return await accountRepository.getMe()
      } catch (error) {
        if (isUnauthorized(error)) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })
}

/** Dùng bên trong vùng đã qua RequireAuth, nơi phiên chắc chắn đã có. */
export function useCurrentUser(): CurrentUser {
  const { data } = useSession()
  if (!data) throw new Error('useCurrentUser must be used inside RequireAuth')
  return data
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: accountRepository.logout,
    onSuccess: () => {
      // Update the live session query first so RequireAuth unmounts the signed-in tree in the same render.
      queryClient.setQueryData(sessionQueryKey, null)
      clearUserScopedQueries(queryClient)
      toast.success('Đã đăng xuất.')
      void navigate('/login', { replace: true })
    },
  })
  return { logout: () => mutation.mutate(), pending: mutation.isPending }
}
