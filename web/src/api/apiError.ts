/** Lỗi theo RFC 9457 Problem Details, xem docs/apiConventions.md. */
export interface FieldError {
  field: string
  message: string
}

export interface ProblemDetail {
  type?: string
  title?: string
  status?: number
  detail?: string
  code?: string
  errors?: FieldError[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string | undefined
  readonly fieldErrors: FieldError[]

  constructor(status: number, problem: ProblemDetail = {}) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = problem.code ?? (status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`)
    this.detail = problem.detail
    this.fieldErrors = problem.errors ?? []
  }
}

export const isUnauthorized = (error: unknown): boolean => error instanceof ApiError && error.status === 401
export const isForbidden = (error: unknown): boolean => error instanceof ApiError && error.status === 403
export const isConflict = (error: unknown): boolean => error instanceof ApiError && error.status === 409

const fallbackMessages: Record<number, string> = {
  0: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  400: 'Dữ liệu gửi lên chưa hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu.',
  409: 'Dữ liệu đã được người khác thay đổi. Tải lại rồi thử lại.',
  422: 'Thao tác không hợp lệ với trạng thái hiện tại.',
}

/** Câu thông báo cho người dùng: ưu tiên lý do máy chủ trả về (IF-01), không lộ lỗi kỹ thuật. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail) return error.detail
    if (error.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
    return fallbackMessages[error.status] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.'
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}
