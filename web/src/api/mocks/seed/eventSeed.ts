import type { EventFormat, EventStatus, RegistrationStatus, StaffKind } from '@/features/event/model/eventTypes'
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
}

export interface DbRegistration {
  id: string
  eventId: string
  userId: string
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

const registrationExtras = { cancelledAt: null, cancelKind: null, promotedAt: null, reconfirmDeadline: null } as const

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
  ]
}
