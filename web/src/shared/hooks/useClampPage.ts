import { useEffect } from 'react'

/** Trang đang xem vượt số trang sau khi dữ liệu đổi (ví dụ vừa duyệt hết trang cuối) thì lùi về trang cuối còn lại. */
export function useClampPage(page: number, totalPages: number | undefined, setPage: (page: number) => void): void {
  useEffect(() => {
    if (totalPages !== undefined && page > 0 && page >= totalPages) setPage(Math.max(totalPages - 1, 0))
  }, [page, totalPages, setPage])
}
