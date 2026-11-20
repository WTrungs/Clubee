import type { PermissionKey } from './permissionTypes'

export type PermissionGroup = 'CLUB' | 'MEMBERS' | 'EVENTS' | 'WORK' | 'FINANCE'

/** Tên, mô tả và nhóm của từng quyền trong bảng phân quyền (FR-ORG-05), dùng chung cho câu thông báo ở máy chủ và giao diện. */
export const PERMISSION_CATALOG: Record<PermissionKey, { label: string; description: string; group: PermissionGroup }> = {
  CONFIGURE_CLUB: { label: 'Sửa hồ sơ, tham số CLB', description: 'Tên, liên hệ, nội quy và các tham số của CLB.', group: 'CLUB' },
  MANAGE_TERMS: { label: 'Nhiệm kỳ, bàn giao', description: 'Khai báo nhiệm kỳ mới và điều hành bàn giao.', group: 'CLUB' },
  MANAGE_DEPARTMENTS: { label: 'Khai báo, đóng ban', description: 'Thêm, sửa, đóng ban chuyên môn.', group: 'CLUB' },
  ASSIGN_POSITIONS: { label: 'Gán, thu hồi chức vụ', description: 'Chức vụ thường trực của ban chủ nhiệm và các ban.', group: 'CLUB' },
  EDIT_PERMISSIONS: { label: 'Chỉnh bảng phân quyền', description: 'Bật, tắt quyền của các chức vụ khác.', group: 'CLUB' },
  MANAGE_MEMBERS: { label: 'Quản lý thành viên', description: 'Duyệt gia nhập, lời mời, chuyển trạng thái, sửa thông tin, chuyển ban.', group: 'MEMBERS' },
  CREATE_EVENT: { label: 'Tạo sự kiện', description: 'Tạo sự kiện và chỉ định Trưởng BTC.', group: 'EVENTS' },
  APPROVE_EVENT: { label: 'Duyệt đề xuất sự kiện', description: 'Duyệt hoặc từ chối sự kiện thành viên đề xuất.', group: 'EVENTS' },
  RUN_EVENT: { label: 'Điều hành sự kiện', description: 'Mở đăng ký, đóng sự kiện.', group: 'EVENTS' },
  MANAGE_EVENT_STAFF: { label: 'Nhân sự sự kiện', description: 'Lập tiểu ban, thêm nhân sự BTC.', group: 'EVENTS' },
  ASSIGN_TASK: { label: 'Giao việc', description: 'Giao việc trong phạm vi của chức vụ.', group: 'WORK' },
  MANAGE_SESSIONS: { label: 'Buổi sinh hoạt, điểm danh', description: 'Tạo buổi, điểm danh và chốt điểm danh.', group: 'WORK' },
  SEND_ANNOUNCEMENT: { label: 'Gửi thông báo', description: 'Gửi thông báo tới nhóm trong phạm vi.', group: 'WORK' },
  PROPOSE_EXPENSE: { label: 'Đề xuất chi', description: 'Đề xuất khoản chi từ quỹ trong phạm vi.', group: 'FINANCE' },
  APPROVE_EXPENSE: { label: 'Duyệt chi', description: 'Duyệt, từ chối khoản chi và điều chỉnh giảm.', group: 'FINANCE' },
  RECORD_LEDGER: { label: 'Ghi sổ quỹ', description: 'Ghi thu, ghi sổ chi, điều chỉnh, quyết toán.', group: 'FINANCE' },
}

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  CLUB: 'Câu lạc bộ',
  MEMBERS: 'Thành viên',
  EVENTS: 'Sự kiện',
  WORK: 'Công việc, sinh hoạt, thông báo',
  FINANCE: 'Tài chính',
}
