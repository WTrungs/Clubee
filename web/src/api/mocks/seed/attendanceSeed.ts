import type { AttendanceActivityType, AttendanceMethod, AttendanceStatus } from '@/features/attendance/model/attendanceTypes'
import { toVnIso, vnDate, vnDayAt } from '../mockTime'

/** Tham số CLB ở SRS 9.2. */
export const DEFAULT_ATTENDANCE_LEAD_MINUTES = 15
export const DEFAULT_QR_ROTATE_SECONDS = 30

/** Buổi sinh hoạt (SRS 4.1); không có BTC, không có quỹ riêng. Dữ liệu tổng hợp (security.md). */
export interface DbSession {
  id: string
  clubId: string
  /** Buổi toàn CLB khi giá trị là `null`. */
  departmentId: string | null
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  capacity: number | null
  registrationDeadline: string | null
  createdBy: string
  createdAt: string
  version: number
}

/** Mỗi người tối đa một bản ghi cho mỗi buổi, hoặc mỗi ngày của sự kiện (BR-ATT-01). */
export interface DbAttendance {
  id: string
  activityType: AttendanceActivityType
  activityId: string
  /** Ngày yyyy-mm-dd với sự kiện; buổi sinh hoạt để trống. */
  day: string | null
  userId: string
  status: AttendanceStatus
  method: AttendanceMethod
  /** Ghi lúc tạo bản ghi: người không thuộc đối tượng mà vẫn đến (FR-ATT-07). */
  extra: boolean
  recordedBy: string
  recordedAt: string
  version: number
}

/** Trạng thái chốt của một buổi hoặc một ngày sự kiện; tạo khi có lần ghi đầu tiên. */
export interface DbAttendanceSheet {
  activityType: AttendanceActivityType
  activityId: string
  day: string | null
  closedAt: string | null
  closedBy: string | null
  version: number
}

/** Mã QR của một chu kỳ (FR-ATT-05). Mã tạm, không phải dữ liệu nghiệp vụ, nên được xóa khi đã cũ. */
export interface DbAttendanceCode {
  activityType: AttendanceActivityType
  activityId: string
  day: string | null
  /** Số thứ tự chu kỳ: `floor(thời điểm / độ dài chu kỳ)`. */
  cycle: number
  code: string
}

const MINUTE_MS = 60 * 1000

/** Mốc cách lúc nạp mock một số phút, làm tròn xuống phút để giờ hiển thị gọn. */
const minutesFromNow = (minutes: number) => toVnIso(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS + minutes * MINUTE_MS)

export function createSessionSeed(): DbSession[] {
  const session = (spec: Omit<DbSession, 'clubId' | 'description' | 'capacity' | 'registrationDeadline' | 'version'> & Partial<DbSession>): DbSession => ({
    clubId: 'c-guitar',
    description: '',
    capacity: null,
    registrationDeadline: null,
    version: 1,
    ...spec,
  })
  return [
    session({
      id: 's-weekly-now',
      departmentId: null,
      title: 'Sinh hoạt định kỳ: hòa âm cơ bản',
      description: 'Ôn các vòng hợp âm I–V–vi–IV, chia nhóm đệm hát theo bè.',
      startAt: minutesFromNow(-30),
      endAt: minutesFromNow(90),
      location: 'Phòng B4.12',
      createdBy: 'u-anh',
      createdAt: vnDayAt(-6, 9),
    }),
    session({
      id: 's-fingerstyle',
      departmentId: null,
      title: 'Sinh hoạt định kỳ: luyện ngón fingerstyle',
      description: 'Bài tập Travis picking, mang theo capo.',
      startAt: vnDayAt(-2, 18),
      endAt: vnDayAt(-2, 20, 30),
      location: 'Phòng B4.12',
      capacity: 30,
      registrationDeadline: vnDayAt(-3, 23),
      createdBy: 'u-anh',
      createdAt: vnDayAt(-9, 10),
    }),
    session({
      id: 's-media-photo',
      departmentId: 'd-media',
      title: 'Workshop chụp ảnh sân khấu',
      description: 'Cách đo sáng khi đèn sân khấu đổi màu liên tục.',
      startAt: vnDayAt(-7, 18),
      endAt: vnDayAt(-7, 20),
      location: 'Phòng truyền thông A2',
      createdBy: 'u-linh',
      createdAt: vnDayAt(-14, 8),
    }),
    session({
      id: 's-media-plan',
      departmentId: 'd-media',
      title: 'Lên kế hoạch truyền thông Đêm nhạc Mùa đông',
      startAt: vnDayAt(3, 18, 30),
      endAt: vnDayAt(3, 20, 30),
      location: 'Phòng truyền thông A2',
      capacity: 12,
      registrationDeadline: vnDayAt(2, 23, 59),
      createdBy: 'u-linh',
      createdAt: vnDayAt(-1, 21),
    }),
    session({
      id: 's-music-rehearsal',
      departmentId: 'd-music',
      title: 'Tập dượt tiết mục Đêm nhạc Mùa đông',
      startAt: vnDayAt(6, 19),
      endAt: vnDayAt(6, 21),
      location: 'Hội trường nhỏ C1',
      createdBy: 'u-anh',
      createdAt: vnDayAt(-2, 14),
    }),
    session({
      id: 's-english-travel',
      clubId: 'c-english',
      departmentId: null,
      title: 'Speaking club: Travel stories',
      startAt: vnDayAt(2, 18),
      endAt: vnDayAt(2, 20),
      location: 'Phòng A3.05',
      createdBy: 'u-tu',
      createdAt: vnDayAt(-3, 9),
    }),
  ]
}

export function createAttendanceSeed(): DbAttendance[] {
  const record = (
    id: string,
    [activityType, activityId, day]: [AttendanceActivityType, string, string | null],
    userId: string,
    status: AttendanceStatus,
    recordedBy: string,
    recordedAt: string,
    { method = 'MANUAL', extra = false }: { method?: AttendanceMethod; extra?: boolean } = {},
  ): DbAttendance => ({ id, activityType, activityId, day, userId, status, method, extra, recordedBy, recordedAt, version: 1 })
  const now: [AttendanceActivityType, string, null] = ['SESSION', 's-weekly-now', null]
  const photo: [AttendanceActivityType, string, null] = ['SESSION', 's-media-photo', null]
  const fingerstyle: [AttendanceActivityType, string, null] = ['SESSION', 's-fingerstyle', null]
  const exchange: [AttendanceActivityType, string, string] = ['EVENT', 'e-exchange', vnDate(-10)]
  const livestream: [AttendanceActivityType, string, string] = ['EVENT', 'e-livestream', vnDate(0)]
  return [
    record('a-now-kiet', now, 'u-kiet', 'PRESENT', 'u-kiet', minutesFromNow(-28), { method: 'QR' }),
    record('a-now-bao', now, 'u-bao', 'PRESENT', 'u-anh', minutesFromNow(-25)),
    record('a-now-ha', now, 'u-ha', 'EXCUSED', 'u-anh', minutesFromNow(-24)),
    record('a-now-huy', now, 'u-huy', 'LATE', 'u-anh', minutesFromNow(-10)),
    record('a-photo-ha', photo, 'u-ha', 'PRESENT', 'u-linh', vnDayAt(-7, 18, 5)),
    record('a-photo-linh', photo, 'u-linh', 'PRESENT', 'u-linh', vnDayAt(-7, 18, 5)),
    record('a-photo-hieu', photo, 'u-hieu', 'PRESENT', 'u-linh', vnDayAt(-7, 18, 10), { extra: true }),
    record('a-photo-vy', photo, 'u-vy', 'ABSENT', 'u-linh', vnDayAt(-7, 20, 15)),
    record('a-finger-nam', fingerstyle, 'u-nam', 'PRESENT', 'u-anh', vnDayAt(-2, 18, 2)),
    record('a-finger-thao', fingerstyle, 'u-thao', 'LATE', 'u-anh', vnDayAt(-2, 18, 20)),
    record('a-exchange-anh', exchange, 'u-anh', 'PRESENT', 'u-huy', vnDayAt(-10, 17, 55)),
    record('a-exchange-bao', exchange, 'u-bao', 'PRESENT', 'u-huy', vnDayAt(-10, 17, 58)),
    record('a-live-ha', livestream, 'u-ha', 'PRESENT', 'u-ha', vnDayAt(0, 0, 10), { method: 'QR' }),
  ]
}

export function createAttendanceSheetSeed(): DbAttendanceSheet[] {
  const sheet = (activityType: AttendanceActivityType, activityId: string, day: string | null, version: number, closed?: [string, string]) => ({
    activityType,
    activityId,
    day,
    closedAt: closed?.[0] ?? null,
    closedBy: closed?.[1] ?? null,
    version,
  })
  return [
    sheet('SESSION', 's-weekly-now', null, 4),
    sheet('SESSION', 's-media-photo', null, 5, [vnDayAt(-7, 20, 15), 'u-linh']),
    sheet('SESSION', 's-fingerstyle', null, 2),
    sheet('EVENT', 'e-exchange', vnDate(-10), 2),
    sheet('EVENT', 'e-livestream', vnDate(0), 1),
  ]
}
