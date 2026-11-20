import { z } from 'zod'

const HTTP_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i
const CONTACT_PHONE = /^0\d{9,10}$/

/** Bỏ dấu cách, chấm, gạch mà người dùng hay gõ khi nhập số điện thoại. */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s.-]/g, '')
}

/** Số liên hệ của CLB: 10–11 chữ số, bắt đầu bằng 0 (cho cả số bàn). */
export function isContactPhone(value: string): boolean {
  return CONTACT_PHONE.test(normalizePhone(value))
}

/** Chỉ trả về liên kết http(s) để không đưa `javascript:` hay scheme lạ vào `href`. */
export function safeHttpUrl(value: string | null): string | null {
  if (!value || !HTTP_URL.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Form và máy chủ mock dùng chung một kiểm tra để không nhận ở bên này mà từ chối ở bên kia. */
export function isEmail(value: string): boolean {
  return z.email().safeParse(value).success
}
