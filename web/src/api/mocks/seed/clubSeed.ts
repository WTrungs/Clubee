import { DEFAULT_ATTENDANCE_LEAD_MINUTES, DEFAULT_QR_ROTATE_SECONDS } from './attendanceSeed'
import { DEFAULT_RECEIPT_THRESHOLD } from './financeSeed'
import type { ClubStatus } from '@/features/club/model/clubTypes'

export interface DbClubStatusChange {
  from: ClubStatus
  to: ClubStatus
  at: string
  by: string
  reason: string
}

/** Dữ liệu tổng hợp, không phải người thật (security.md). */
export interface DbClub {
  id: string
  name: string
  shortName: string
  field: string
  description: string
  foundedOn: string
  logoUrl: string | null
  /** Liên hệ công khai, ai cũng xem được (SRS 3.5). */
  contactEmail: string | null
  contactPhone: string | null
  contactUrl: string | null
  rules: string
  /** ST-CLB (FR-CLB-04): Hoạt động ↔ Tạm ngừng; cả hai → Giải thể. */
  status: ClubStatus
  statusHistory: DbClubStatusChange[]
  /** Tham số CLB ở SRS 9.2. */
  collectsStudentId: boolean
  probationStep: boolean
  /** Ngưỡng chi bắt buộc chứng từ (BR-FIN-03); sửa ở FR-CLB-03. */
  expenseReceiptThreshold: number
  /** Số phút mở điểm danh trước giờ bắt đầu (BR-ATT-02). */
  attendanceLeadMinutes: number
  /** Chu kỳ đổi mã QR điểm danh, tính bằng giây (FR-ATT-05). */
  attendanceQrRotateSeconds: number
  /** Người chốt sửa được điểm danh trong số giờ này sau khi chốt; quá hạn chỉ ban chủ nhiệm (FR-ATT-08, BR-ATT-04). */
  attendanceEditHours: number
  /** Số ngày liên kết mời gia nhập còn hiệu lực (FR-MEM-01); lời mời đã tạo giữ hạn cũ. */
  inviteLinkDays: number
  /** Người đã nhận chỗ hủy được tới trước giờ bắt đầu số giờ này (FR-EVT-13). */
  registrationCancelHours: number
  /** Số giờ để xác nhận lại khi sự kiện dời thời gian (FR-EVT-14). */
  rescheduleConfirmHours: number
  /** Nhắc việc trước hạn số ngày này; 0 là không nhắc (FR-TASK-06). */
  taskReminderDays: number
  /** Cảnh báo khi giao việc làm số việc đang làm của người nhận vượt ngưỡng này (FR-TASK-09, SRS 9.2). */
  taskOverloadThreshold: number
  /** Hạn quyết toán tạm ứng gợi ý, tính từ ngày đề xuất (FR-FIN-07). */
  advanceSettleDays: number
  /** Mốc bắt đầu học kỳ dạng `MM-DD` cho báo cáo thu chi (FR-FIN-12); không có mốc hè thì kỳ hè gộp vào học kỳ 2. */
  semester1Start: string
  semester2Start: string
  summerStart: string | null
  /** Tham số sửa ở FR-CLB-03 có version riêng, để sửa hồ sơ và sửa tham số cùng lúc không chặn nhau. */
  settingsVersion: number
  settingsUpdatedAt: string | null
  settingsUpdatedBy: string | null
  version: number
}

export const DEFAULT_INVITE_LINK_DAYS = 7
export const DEFAULT_ATTENDANCE_EDIT_HOURS = 48

/** Tham số chưa từng sửa: theo mặc định SRS 9.2. */
export const defaultClubSettings = () => ({
  probationStep: true,
  expenseReceiptThreshold: DEFAULT_RECEIPT_THRESHOLD,
  attendanceLeadMinutes: DEFAULT_ATTENDANCE_LEAD_MINUTES,
  attendanceQrRotateSeconds: DEFAULT_QR_ROTATE_SECONDS,
  attendanceEditHours: DEFAULT_ATTENDANCE_EDIT_HOURS,
  inviteLinkDays: DEFAULT_INVITE_LINK_DAYS,
  registrationCancelHours: 24,
  rescheduleConfirmHours: 48,
  taskReminderDays: 1,
  taskOverloadThreshold: 5,
  advanceSettleDays: 14,
  semester1Start: '09-01',
  semester2Start: '02-01',
  summerStart: null,
  settingsVersion: 1,
  settingsUpdatedAt: null,
  settingsUpdatedBy: null,
})

export function createClubSeed(): DbClub[] {
  return [
    {
      id: 'c-guitar',
      name: 'CLB Guitar Sinh viên',
      shortName: 'GSV',
      field: 'Âm nhạc',
      description: 'Nơi những bạn yêu guitar cùng tập luyện, biểu diễn và tổ chức các đêm nhạc gây quỹ.',
      foundedOn: '2016-09-15',
      logoUrl: null,
      contactEmail: 'guitar.gsv@demo.test',
      contactPhone: null,
      contactUrl: 'https://example.com/clb-guitar',
      rules: [
        'Tham gia ít nhất 3 buổi sinh hoạt mỗi tháng.',
        'Giữ gìn nhạc cụ chung, mượn và trả đúng hẹn.',
        'Tôn trọng thành viên và khán giả trong mọi buổi diễn.',
      ].join('\n'),
      status: 'ACTIVE',
      statusHistory: [],
      collectsStudentId: true,
      ...defaultClubSettings(),
      version: 1,
    },
    {
      id: 'c-english',
      name: 'CLB Tiếng Anh Giao tiếp',
      shortName: 'ECC',
      field: 'Ngoại ngữ',
      description: 'Sinh hoạt nói tiếng Anh hằng tuần, tổ chức cuộc thi hùng biện và trại hè ngoại ngữ.',
      foundedOn: '2014-03-01',
      logoUrl: null,
      contactEmail: 'ecc@demo.test',
      contactPhone: null,
      contactUrl: null,
      rules: '',
      status: 'ACTIVE',
      statusHistory: [],
      collectsStudentId: false,
      ...defaultClubSettings(),
      version: 1,
    },
    {
      id: 'c-volunteer',
      name: 'Đội Tình nguyện Xanh',
      shortName: 'ĐTN',
      field: 'Tình nguyện',
      description: 'Các chiến dịch môi trường, hiến máu và mùa hè tình nguyện cho cộng đồng.',
      foundedOn: '2012-05-19',
      logoUrl: null,
      contactEmail: null,
      contactPhone: null,
      contactUrl: null,
      rules: '',
      status: 'ACTIVE',
      statusHistory: [],
      collectsStudentId: true,
      ...defaultClubSettings(),
      probationStep: false,
      version: 1,
    },
  ]
}
