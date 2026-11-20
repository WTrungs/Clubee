import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { AccountTransitionRequest, AdminAccount, AdminAccountQuery, AdminMetrics } from './adminTypes'

const account = (userId: string) => `/admin/accounts/${encodeURIComponent(userId)}`

/** FR-ACC-09: chỉ tài khoản Admin gọi được (máy chủ trả 403 `ADMIN_ONLY` với tài khoản thường). */
export const adminRepository = {
  metrics: () => httpClient.get<AdminMetrics>('/admin/metrics'),
  accounts: (query: AdminAccountQuery) => httpClient.get<Page<AdminAccount>>('/admin/accounts', { query: { email: query.email, page: query.page, size: query.size } }),
  transition: (userId: string, request: AccountTransitionRequest) => httpClient.post<AdminAccount>(`${account(userId)}/transitions`, request),
  sendPasswordReset: (userId: string) => httpClient.post<void>(`${account(userId)}/password-reset-links`),
}
