import type { CoHostStatus, EventFormat, EventStatus, RegistrationStatus, StaffKind } from '@/features/event/model/eventTypes'
import { vnDayAt } from '../mockTime'

export interface DbEvent {
  id: string
  clubId: string
  name: string
  description: string
  startAt: string
  endAt: string
  format: EventFormat
  location: string | null
  onlineUrl: string | null
  capacity: number | null
  registrationDeadline: string | null
  openToGuests: boolean
  status: EventStatus
  /** Bước cuối đã đạt trước khi hủy, để hiện tiến trình. */
  statusBeforeCancel: EventStatus | null
  proposerId: string
  approverId: string | null
  rejectionReason: string | null
  cancellationReason: string | null
  /** Các lần dời thời gian, cũ trước (FR-EVT-14); họ tên người dời chụp lúc dời. */
  scheduleChanges: DbScheduleChange[]
  createdAt: string
  version: number
}

export interface DbScheduleChange {
  at: string
  actorId: string
  actorName: string
  fromStartAt: string
  fromEndAt: string
  toStartAt: string
  toEndAt: string
  reason: string
}

export interface DbSubcommittee {
  id: string
  eventId: string
  name: string
  description: string
  quota: number | null
}

export interface DbEventStaff {
  userId: string
  eventId: string
  subcommitteeId: string
  kind: StaffKind
  joinedAt: string
  /** Thời điểm thôi làm nhân sự, ví dụ khi bị đưa ra khỏi CLB (FR-MEM-08). */
  leftAt: string | null
  /** CLB gốc của nhân sự `CO_HOST` (FR-EVT-08); rời CLB gốc hoặc CLB đó bị gỡ thì thôi làm nhân sự. */
  homeClubId?: string
}

/** Lời mời đồng tổ chức theo ST-COH (FR-EVT-08); quỹ vẫn thuộc CLB chủ trì (BR-FIN-07). */
export interface DbEventCoHost {
  id: string
  eventId: string
  hostClubId: string
  clubId: string
  status: CoHostStatus
  message: string
  invitedBy: string
  invitedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  removedBy: string | null
  removedAt: string | null
  removeReason: string | null
  version: number
}

/** Lời mời Đã gửi từ Đêm nhạc Mùa đông tới CLB Tiếng Anh, chờ ban chủ nhiệm CLB đó trả lời. */
export function createCoHostSeed(): DbEventCoHost[] {
  return [
    {
      id: 'ch-winter-english',
      eventId: 'e-winter',
      hostClubId: 'c-guitar',
      clubId: 'c-english',
      status: 'SENT',
      message: 'Mời CLB Tiếng Anh cùng tổ chức phần giao lưu song ngữ.',
      invitedBy: 'u-bao',
      invitedAt: vnDayAt(-2, 10),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      removedBy: null,
      removedAt: null,
      removeReason: null,
      version: 1,
    },
  ]
}

/** Khách mời đăng ký trên trang công khai (FR-EVT-12): không có tài khoản, nhận mã tham dự qua email. */
export interface DbGuestInfo {
  fullName: string
  email: string | null
  phone: string | null
  /** Mã tham dự in trong QR; BTC tra theo mã, email hoặc SĐT (FR-ATT-07). */
  code: string
  /** Mỗi ngày của sự kiện ghi có mặt một lần (yyyy-mm-dd). */
  checkIns: Array<{ day: string; at: string; by: string }>
}

export interface DbRegistration {
  id: string
  eventId: string
  /** `null` với khách mời. */
  userId: string | null
  guest: DbGuestInfo | null
  status: RegistrationStatus
  registeredAt: string
  cancelledAt: string | null
  /** Tự hủy, hoặc hệ thống hủy vì quá hạn xác nhận lại (FR-EVT-14). */
  cancelKind: 'SELF' | 'EXPIRED' | null
  /** Lúc được đôn từ danh sách chờ (FR-EVT-13). */
  promotedAt: string | null
  /** Hạn xác nhận lại khi sự kiện dời thời gian (FR-EVT-14). */
  reconfirmDeadline: string | null
}

const registrationExtras = { cancelledAt: null, cancelKind: null, promotedAt: null, reconfirmDeadline: null, guest: null } as const

const event = (spec: Partial<DbEvent> & Pick<DbEvent, 'id' | 'name' | 'status' | 'startAt' | 'endAt' | 'proposerId'>): DbEvent => ({
  clubId: 'c-guitar',
  description: '',
  format: 'OFFLINE',
  location: null,
  onlineUrl: null,
  capacity: null,
  registrationDeadline: null,
  openToGuests: false,
  statusBeforeCancel: null,
  approverId: null,
  rejectionReason: null,
  cancellationReason: null,
  scheduleChanges: [],
  createdAt: vnDayAt(-30, 10),
  version: 1,
  ...spec,
})

export function createEventSeed(): DbEvent[] {
  return [
    event({
      id: 'e-winter',
      name: 'Đêm nhạc Mùa đông',
      description:
        'Đêm nhạc acoustic gây quỹ cuối năm với 11 tiết mục guitar đệm hát và độc tấu. Toàn bộ tiền vé ủng hộ quỹ học bổng của CLB.',
      status: 'REGISTRATION_OPEN',
      startAt: vnDayAt(12, 19),
      endAt: vnDayAt(12, 22),
      location: 'Hội trường A, Nhà văn hóa sinh viên',
      capacity: 12,
      registrationDeadline: vnDayAt(10, 23, 59),
      openToGuests: true,
      proposerId: 'u-bao',
      approverId: 'u-anh',
    }),
    event({
      id: 'e-workshop',
      name: 'Workshop đệm hát cơ bản',
      description: 'Buổi hướng dẫn 5 điệu đệm phổ biến cho thành viên mới, có đàn cho mượn tại chỗ.',
      status: 'APPROVED',
      startAt: vnDayAt(20, 18),
      endAt: vnDayAt(20, 20, 30),
      location: 'Phòng B2.14',
      capacity: 30,
      registrationDeadline: vnDayAt(19, 12),
      proposerId: 'u-nam',
      approverId: 'u-huy',
    }),
    event({
      id: 'e-busking',
      name: 'Biểu diễn đường phố gây quỹ',
      description: 'Biểu diễn tại phố đi bộ vào chiều Chủ nhật, quyên góp cho mái ấm trẻ em.',
      status: 'PENDING_APPROVAL',
      startAt: vnDayAt(30, 16),
      endAt: vnDayAt(30, 20),
      location: 'Phố đi bộ Nguyễn Huệ',
      capacity: null,
      proposerId: 'u-ha',
      createdAt: vnDayAt(-2, 21),
    }),
    event({
      id: 'e-camp',
      name: 'Trại sáng tác cuối tuần',
      description: 'Hai ngày một đêm ở ngoại thành, viết và thu âm 3 bài hát của CLB.',
      status: 'DRAFT',
      startAt: vnDayAt(45, 7),
      endAt: vnDayAt(46, 17),
      location: 'Khu cắm trại Suối Mơ',
      capacity: 25,
      proposerId: 'u-bao',
      createdAt: vnDayAt(-1, 22),
    }),
    event({
      id: 'e-livestream',
      name: 'Livestream hướng dẫn bấm hợp âm',
      description: 'Buổi livestream hỏi đáp trên fanpage, ai cũng xem được.',
      status: 'ONGOING',
      format: 'ONLINE',
      onlineUrl: 'https://example.com/live',
      openToGuests: true,
      startAt: vnDayAt(0, 0, 5),
      endAt: vnDayAt(1, 23),
      proposerId: 'u-kiet',
      approverId: 'u-anh',
    }),
    event({
      id: 'e-exchange',
      name: 'Giao lưu guitar cùng CLB bạn',
      description: 'Buổi giao lưu với CLB Guitar trường bạn, mỗi bên 5 tiết mục.',
      status: 'ENDED',
      startAt: vnDayAt(-10, 18),
      endAt: vnDayAt(-10, 21),
      location: 'Sân khấu ngoài trời khu B',
      capacity: 40,
      registrationDeadline: vnDayAt(-12, 12),
      proposerId: 'u-anh',
      approverId: 'u-anh',
    }),
    event({
      id: 'e-acoustic-sep',
      name: 'Đêm nhạc acoustic tháng 9',
      description: 'Đêm nhạc chào thành viên mới.',
      status: 'CANCELLED',
      statusBeforeCancel: 'REGISTRATION_OPEN',
      cancellationReason: 'Trùng lịch thi giữa kỳ, dời sang học kỳ sau.',
      startAt: vnDayAt(-40, 19),
      endAt: vnDayAt(-40, 21),
      location: 'Hội trường C',
      capacity: 80,
      proposerId: 'u-linh',
      approverId: 'u-anh',
      createdAt: vnDayAt(-75, 10),
    }),
    event({
      id: 'e-speaking',
      clubId: 'c-english',
      name: 'Speaking Club: Du lịch',
      description: 'Luyện nói theo nhóm nhỏ với chủ đề du lịch, có người điều phối mỗi bàn.',
      status: 'REGISTRATION_OPEN',
      startAt: vnDayAt(5, 18, 30),
      endAt: vnDayAt(5, 20, 30),
      location: 'Phòng A1.02',
      capacity: 20,
      registrationDeadline: vnDayAt(4, 22),
      proposerId: 'u-ha',
      approverId: 'u-tu',
    }),
  ]
}

export function createSubcommitteeSeed(): DbSubcommittee[] {
  return [
    { id: 'sc-winter-logistics', eventId: 'e-winter', name: 'Hậu cần', description: 'Âm thanh, ánh sáng, bàn ghế, đón khách.', quota: 4 },
    { id: 'sc-winter-media', eventId: 'e-winter', name: 'Truyền thông', description: 'Poster, vé mời, đăng bài, chụp ảnh.', quota: 4 },
    { id: 'sc-winter-program', eventId: 'e-winter', name: 'Chương trình', description: 'Tiết mục, kịch bản, dẫn chương trình.', quota: 3 },
  ]
}

export function createEventStaffSeed(): DbEventStaff[] {
  const joinedAt = vnDayAt(-14, 20)
  const staff: Array<[string, string]> = [
    ['u-long', 'sc-winter-logistics'],
    ['u-khoa', 'sc-winter-logistics'],
    ['u-tram', 'sc-winter-logistics'],
    ['u-linh', 'sc-winter-media'],
    ['u-ha', 'sc-winter-media'],
    ['u-vy', 'sc-winter-media'],
    ['u-nam', 'sc-winter-program'],
    ['u-kiet', 'sc-winter-program'],
  ]
  return staff.map(([userId, subcommitteeId]) => ({ userId, eventId: 'e-winter', subcommitteeId, kind: 'MEMBER', joinedAt, leftAt: null }))
}

export function createRegistrationSeed(): DbRegistration[] {
  const winter = ['u-anh', 'u-huy', 'u-mai', 'u-linh', 'u-long', 'u-vy', 'u-nam', 'u-kiet', 'u-khoa', 'u-thao', 'u-tram']
  const exchange = ['u-anh', 'u-bao', 'u-ha', 'u-huy', 'u-vy', 'u-nam']
  const speaking = ['u-tu', 'u-tam']
  const livestream = ['u-ha', 'u-vy', 'u-long', 'u-thao']
  return [
    ...winter.map((userId, index) => ({
      id: `r-winter-${index}`,
      eventId: 'e-winter',
      userId,
      status: 'CONFIRMED' as const,
      ...registrationExtras,
      registeredAt: vnDayAt(-5 + Math.floor(index / 3), 9 + index),
    })),
    ...exchange.map((userId, index) => ({
      id: `r-exchange-${index}`,
      eventId: 'e-exchange',
      userId,
      status: 'CONFIRMED' as const,
      ...registrationExtras,
      registeredAt: vnDayAt(-15, 9 + index),
    })),
    ...livestream.map((userId, index) => ({
      id: `r-livestream-${index}`,
      eventId: 'e-livestream',
      userId,
      status: 'CONFIRMED' as const,
      ...registrationExtras,
      registeredAt: vnDayAt(-2, 9 + index),
    })),
    ...speaking.map((userId, index) => ({
      id: `r-speaking-${index}`,
      eventId: 'e-speaking',
      userId,
      status: 'CONFIRMED' as const,
      ...registrationExtras,
      registeredAt: vnDayAt(-1, 9 + index),
    })),
    // Khách mời của buổi livestream đang diễn ra, để BTC thử tra mã và ghi có mặt (FR-EVT-12).
    {
      id: 'r-livestream-guest',
      eventId: 'e-livestream',
      userId: null,
      status: 'CONFIRMED' as const,
      ...registrationExtras,
      guest: { fullName: 'Phạm Minh Châu', email: 'chau.pham@khach.test', phone: '0901234567', code: 'KHACH7Q2', checkIns: [] },
      registeredAt: vnDayAt(-2, 20),
    },
  ]
}
