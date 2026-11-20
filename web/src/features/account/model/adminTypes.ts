import type { AccountType } from './accountTypes'

/** ST-ACC: Chờ xác thực, Hoạt động, Bị khóa. */
export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'LOCKED'

export type AdminAccountAction = 'LOCK' | 'UNLOCK' | 'SEND_PASSWORD_RESET'

/** FR-ACC-09: Admin chỉ thấy thông tin tài khoản, không thấy SĐT hay dữ liệu CLB (SRS 3.4). */
export interface AdminAccount {
  id: string
  fullName: string
  email: string
  status: AccountStatus
  accountType: AccountType
  createdAt: string
  lastLoginAt: string | null
  /** Số CLB đang có tư cách hoạt động, không nêu tên CLB. */
  clubCount: number
  lockReason: string | null
  lockedAt: string | null
  allowedActions: AdminAccountAction[]
  version: number
}

export interface AdminAccountQuery {
  email: string
  page?: number
  size?: number
}

export interface AccountTransitionRequest {
  action: 'LOCK' | 'UNLOCK'
  reason: string
  version: number
}

/** Số liệu vận hành ở trang đầu của Admin (FR-ACC-09). */
export interface AdminMetrics {
  clubCount: number
  accounts: Record<AccountStatus, number>
  /** Người dùng (không tính Admin) đăng nhập trong 30 ngày qua. */
  activeLast30Days: number
  pendingTransferRequests: number
  /** Nguồn thật ở máy chủ (log lỗi); mock luôn trả 0. */
  systemErrorsLast24h: number
  generatedAt: string
}
