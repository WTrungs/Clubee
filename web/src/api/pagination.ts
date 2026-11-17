/** Dạng trang kết quả của Spring Data, xem docs/apiConventions.md. */
export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface PageRequest {
  page?: number
  size?: number
  sort?: string
  q?: string
}

export const DEFAULT_PAGE_SIZE = 20
