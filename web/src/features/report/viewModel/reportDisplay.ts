import { ApiError, getErrorMessage } from '@/api/apiError'

/** Tỷ lệ chuyên cần dạng phần trăm làm tròn; chưa có bản ghi nào tính được thì nói rõ. */
export const rateLabel = (rate: number | null) => (rate === null ? 'Chưa có số liệu' : `${Math.round(rate * 100)}%`)

/** Lỗi 400 của kỳ: nêu lý do theo từng tham số thay vì mời thử lại. */
export function periodErrorReasons(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null
  return error.fieldErrors.length > 0 ? error.fieldErrors.map((fieldError) => fieldError.message) : [getErrorMessage(error)]
}
