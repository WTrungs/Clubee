import { addDays, vnDayAt } from '../mockTime'

/** Lời mời gia nhập CLB (FR-MEM-01); trạng thái suy ra từ hạn, lúc thu hồi và số lần dùng, không lưu riêng. */
export interface DbInvitation {
  id: string
  clubId: string
  /** Liên kết dùng được nhiều lần tới khi hết hạn; lời mời qua email chỉ dùng một lần, đúng tài khoản có email đó. */
  kind: 'LINK' | 'EMAIL'
  token: string
  email: string | null
  createdBy: string
  createdAt: string
  /** Tính lúc tạo theo tham số CLB khi đó; đổi tham số sau này không đổi hạn của lời mời đã tạo (FR-CLB-03). */
  expiresAt: string
  revokedAt: string | null
  revokedBy: string | null
  useCount: number
  version: number
}

/** Mã cố định là dữ liệu mẫu để e2e mở thẳng bằng đường dẫn; mã thật sinh ngẫu nhiên. */
export function createInvitationSeed(): DbInvitation[] {
  const linkCreatedAt = vnDayAt(-3, 9)
  const emailCreatedAt = vnDayAt(-12, 14)
  return [
    {
      id: 'inv-guitar-link',
      clubId: 'c-guitar',
      kind: 'LINK',
      token: 'demo-guitar',
      email: null,
      createdBy: 'u-anh',
      createdAt: linkCreatedAt,
      expiresAt: addDays(linkCreatedAt, 7),
      revokedAt: null,
      revokedBy: null,
      // Quân đã dùng liên kết này để gửi yêu cầu đang chờ duyệt.
      useCount: 1,
      version: 1,
    },
    {
      id: 'inv-guitar-tam',
      clubId: 'c-guitar',
      kind: 'EMAIL',
      token: 'demo-guitar-old',
      email: 'tam.duong@demo.test',
      createdBy: 'u-huy',
      createdAt: emailCreatedAt,
      expiresAt: addDays(emailCreatedAt, 7),
      revokedAt: null,
      revokedBy: null,
      useCount: 0,
      version: 1,
    },
  ]
}
