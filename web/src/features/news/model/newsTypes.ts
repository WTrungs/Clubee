import type { PersonRef } from '@/api/commonTypes'

/** ST-NEWS: Nháp → Đã xuất bản ↔ Đã ẩn. */
export type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN'

export type NewsAction = 'EDIT' | 'PUBLISH' | 'HIDE'

export interface NewsSummary {
  id: string
  title: string
  /** Đoạn đầu của nội dung, cắt sẵn ở máy chủ. */
  excerpt: string
  imageUrl: string | null
  status: NewsStatus
  author: PersonRef
  publishedAt: string | null
  updatedAt: string
}

export interface NewsDetail extends NewsSummary {
  /** Chữ thuần, giữ xuống dòng; không phải HTML. */
  body: string
  createdAt: string
  hiddenAt: string | null
  hiddenBy: PersonRef | null
  allowedActions: NewsAction[]
  version: number
}

export interface NewsQuery {
  q?: string
  status?: NewsStatus
  page?: number
}

export interface NewsRequest {
  title: string
  body: string
}

export interface UpdateNewsRequest extends NewsRequest {
  version: number
}
