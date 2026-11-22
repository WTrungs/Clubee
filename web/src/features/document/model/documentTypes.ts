import type { PersonRef } from '@/api/commonTypes'

/** Nơi sở hữu tài liệu (FR-DOC-01): CLB, một ban hoặc một sự kiện. */
export type DocumentOwnerType = 'CLUB' | 'DEPARTMENT' | 'EVENT'

/** Ai xem được: toàn CLB; ban hoặc BTC của nơi sở hữu (kèm ban chủ nhiệm); chỉ ban chủ nhiệm. */
export type DocumentVisibility = 'CLUB' | 'OWNER' | 'BOARD'

export interface DocumentOwner {
  type: DocumentOwnerType
  /** Bằng `null` khi nơi sở hữu là CLB. */
  id: string | null
  name: string
}

/** Thao tác máy chủ cho phép với tài liệu: tải phiên bản mới (FR-DOC-03). */
export type DocumentAction = 'UPLOAD_VERSION'

export interface DocumentSummary {
  id: string
  title: string
  fileName: string
  fileSize: number
  contentType: string
  owner: DocumentOwner
  term: { id: string; name: string } | null
  tags: string[]
  visibility: DocumentVisibility
  /** Họ tên chụp lúc tải lên; người tải rời CLB thì tài liệu vẫn còn (BR-DATA-02). */
  uploadedBy: PersonRef
  uploadedAt: string
  /** Số bản hiện hành; tệp, người tải, lúc tải ở trên là của bản này. */
  currentVersion: number
  allowedActions: DocumentAction[]
  version: number
}

/** Một phiên bản tài liệu (FR-DOC-03); họ tên người tải chụp lúc tải. */
export interface DocumentVersion {
  number: number
  fileName: string
  fileSize: number
  contentType: string
  note: string
  uploadedBy: PersonRef
  uploadedAt: string
  current: boolean
}

export interface DocumentDetail extends DocumentSummary {
  description: string
  /** Mọi phiên bản, mới nhất trước. */
  versions: DocumentVersion[]
}

export interface UploadVersionRequest {
  file: File
  note: string
  version: number
}

/** Nơi người dùng được tải lên (quyền `MANAGE_DOCUMENTS` theo phạm vi). */
export interface DocumentScopeOption {
  type: DocumentOwnerType
  id: string | null
  name: string
}

export interface DocumentFacets {
  tags: string[]
  terms: Array<{ id: string; name: string }>
  owners: DocumentOwner[]
}

export interface DocumentQuery {
  q?: string
  tag?: string
  termId?: string
  ownerType?: DocumentOwnerType
  ownerId?: string
  page?: number
}

export interface UploadDocumentRequest {
  file: File
  title: string
  description: string
  ownerType: DocumentOwnerType
  ownerId: string | null
  termId: string | null
  tags: string[]
  visibility: DocumentVisibility
}
