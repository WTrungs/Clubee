import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router'
import { createQueryClient } from '@/api/queryClient'
import { startSession } from '@/api/mocks/mockSession'

/** Bọc hook/component với QueryClient mới và router trong bộ nhớ; mạng do MSW node trả lời. */
export function createTestWrapper(initialEntry: InitialEntry = '/') {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 }, mutations: { retry: false } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return { wrapper, queryClient }
}

/** Đăng nhập sẵn một người dùng mock cho test. */
export function signInAs(userId: string): void {
  startSession(userId)
}
