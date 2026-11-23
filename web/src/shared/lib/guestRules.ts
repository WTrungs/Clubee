import { isContactPhone, isEmail, normalizePhone } from './contactRules'

/** Khách mời đăng ký sự kiện (FR-EVT-12): họ tên và ít nhất một trong email, SĐT; dùng chung cho form và mock. */
export const GUEST_NAME_MIN = 2
export const GUEST_NAME_MAX = 100

export interface GuestContactInput {
  fullName?: string | null
  email?: string | null
  phone?: string | null
}

/** Chuẩn hóa: email viết thường, SĐT bỏ khoảng trắng; trả lỗi theo ô như máy chủ. */
export function parseGuestContact(input: GuestContactInput) {
  const fullName = (input.fullName ?? '').trim().replace(/\s+/g, ' ')
  const email = (input.email ?? '').trim().toLowerCase()
  const phone = normalizePhone(input.phone ?? '')
  const errors = [
    ...(fullName.length < GUEST_NAME_MIN || fullName.length > GUEST_NAME_MAX ? [{ field: 'fullName', message: `Họ tên cần từ ${GUEST_NAME_MIN} đến ${GUEST_NAME_MAX} ký tự.` }] : []),
    ...(email !== '' && !isEmail(email) ? [{ field: 'email', message: 'Email không hợp lệ.' }] : []),
    ...(phone !== '' && !isContactPhone(phone) ? [{ field: 'phone', message: 'Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0.' }] : []),
    ...(email === '' && phone === '' ? [{ field: 'email', message: 'Nhập email hoặc số điện thoại để nhận mã tham dự.' }] : []),
  ]
  return { fullName, email: email || null, phone: phone || null, errors }
}

/** Che bớt liên hệ khi hiện cho người khác (BTC, trang vé). */
export function maskContact(value: string | null): string | null {
  if (!value) return null
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@')
    return `${local.slice(0, 2)}***@${domain}`
  }
  return `${value.slice(0, 3)}****${value.slice(-3)}`
}
