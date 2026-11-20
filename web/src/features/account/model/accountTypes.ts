/** ST-MEM: Chờ duyệt, Thử việc, Chính thức, Tạm nghỉ, Đã rời. */
export type MemberStatus = 'PENDING' | 'PROBATION' | 'ACTIVE' | 'ON_LEAVE' | 'LEFT'

export interface ClubMembershipSummary {
  clubId: string
  clubName: string
  shortName: string
  logoUrl: string | null
  field: string
  memberStatus: MemberStatus
  departmentName: string | null
  positionTitles: string[]
  memberCount: number
}

/** Sự kiện người dùng đang làm BTC ở CLB mà họ không là thành viên (FR-ACC-06). */
export interface StaffEventSummary {
  eventId: string
  eventName: string
  clubId: string
  clubName: string
  roleTitle: string
}

/** Quản trị hệ thống chỉ dùng khu `/admin`, không là thành viên CLB nào (SRS 3.4, NFR-SEC-06). */
export type AccountType = 'USER' | 'ADMIN'

export interface CurrentUser {
  id: string
  fullName: string
  email: string
  avatarUrl: string | null
  accountType: AccountType
  memberships: ClubMembershipSummary[]
  staffEvents: StaffEventSummary[]
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  fullName: string
  email: string
  password: string
}

export interface RegisterResponse {
  email: string
}

/** Hồ sơ cá nhân dùng chung cho mọi CLB (FR-ACC-05). */
export interface Profile {
  fullName: string
  email: string
  /** Email mới chờ xác thực; email cũ vẫn dùng để đăng nhập đến khi người dùng mở liên kết. */
  pendingEmail: string | null
  phone: string | null
  birthDate: string | null
  avatarUrl: string | null
  version: number
}

export interface UpdateProfileRequest {
  fullName: string
  phone: string | null
  birthDate: string | null
  version: number
}

export interface EmailChangeRequest {
  newEmail: string
  currentPassword: string
}

export interface EmailChangeReceipt {
  pendingEmail: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}
