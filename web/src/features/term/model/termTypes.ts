import type { PersonRef } from '@/api/commonTypes'
import type { HandoverProgress } from './handoverTypes'

/** ST-TERM: Chuẩn bị → Đang chạy → Đang bàn giao → Đã đóng. */
export type TermStatus = 'PREPARING' | 'RUNNING' | 'HANDING_OVER' | 'CLOSED'

/** Thao tác trên nhiệm kỳ: sửa và bắt đầu bàn giao ở nhiệm kỳ Chuẩn bị, mở phiên bàn giao ở cả hai nhiệm kỳ liên quan. */
export type TermAction = 'EDIT' | 'START_HANDOVER' | 'VIEW_HANDOVER'

/** Một dòng trong kế hoạch ban của nhiệm kỳ Chuẩn bị (FR-TERM-01); `departmentId` null là ban sẽ tạo mới. */
export interface DepartmentPlanEntry {
  id: string
  departmentId: string | null
  name: string
  description: string
  dropped: boolean
  /** Tên hiện tại của ban đã có, để thấy ban sẽ được đổi tên. */
  currentName: string | null
  memberCount: number
  /** Lý do chưa bỏ được ban; null là bỏ được. */
  dropBlockedReason: string | null
}

export interface Term {
  id: string
  name: string
  startOn: string
  endOn: string
  status: TermStatus
  createdAt: string
  createdBy: PersonRef | null
  closedAt: string | null
  /** Chỉ nhiệm kỳ Chuẩn bị mới có kế hoạch ban. */
  departmentPlan: DepartmentPlanEntry[] | null
  /** Phiên bàn giao gần nhất mà nhiệm kỳ này là bên giao hoặc bên nhận. */
  handoverId: string | null
  /** Chỉ có khi phiên bàn giao đó còn mở. */
  handoverProgress: HandoverProgress | null
  allowedActions: TermAction[]
  version: number
}

/** FR-TERM-01: nhiệm kỳ mới ở Chuẩn bị; máy chủ chép các ban đang hoạt động làm kế hoạch ban. */
export interface CreateTermRequest {
  name: string
  startOn: string
  endOn: string
}

/** Dòng gửi lên: `id` null là dòng mới thêm ở form. */
export interface DepartmentPlanEntryRequest {
  id: string | null
  departmentId: string | null
  name: string
  description: string
  dropped: boolean
}

/** Chỉ gửi phần cần sửa; `departmentPlan` gửi thì thay cả kế hoạch. */
export interface UpdateTermRequest {
  name?: string
  startOn?: string
  endOn?: string
  departmentPlan?: DepartmentPlanEntryRequest[]
  version: number
}
