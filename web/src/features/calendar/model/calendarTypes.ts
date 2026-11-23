/** Quan hệ của người dùng với một mục trên lịch (FR-ATT-09). */
export type CalendarRelation =
  /** Buổi: thuộc phạm vi của buổi (Thử việc, Chính thức). */
  | 'AUDIENCE'
  /** Buổi do chính người dùng tạo. */
  | 'CREATOR'
  /** Đã nhận chỗ (buổi hoặc sự kiện). */
  | 'REGISTERED'
  /** Đang ở danh sách chờ. */
  | 'WAITLISTED'
  /** Làm BTC sự kiện: Trưởng BTC, nhân sự tiểu ban, CTV, nhân sự CLB đồng tổ chức. */
  | 'STAFF'
  /** Sự kiện đang mở đăng ký ở CLB của người dùng. */
  | 'OPEN'

export interface CalendarItem {
  type: 'SESSION' | 'EVENT'
  id: string
  clubId: string
  clubName: string
  title: string
  startAt: string
  endAt: string
  location: string
  relations: CalendarRelation[]
  cancelled: boolean
}

export interface CalendarClub {
  id: string
  name: string
}

export interface Calendar {
  from: string
  to: string
  items: CalendarItem[]
  /** CLB để lọc: các CLB người dùng đang tham gia và CLB có mục trên lịch. */
  clubs: CalendarClub[]
}

export interface CalendarQuery {
  /** Ngày yyyy-mm-dd theo giờ Việt Nam, tính cả hai đầu; tối đa 62 ngày. */
  from: string
  to: string
  clubId?: string
}
