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
}

export interface DocumentDetail extends DocumentSummary {
  description: string
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
