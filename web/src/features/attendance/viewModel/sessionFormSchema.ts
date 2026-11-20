import { z } from 'zod'
import { formatDate, formatTime, parseVnDate, parseVnDateTime } from '@/shared/format/formatDate'
import { recurrenceDays, recurrenceError, vnDayOf, type RecurrenceFrequency } from '@/shared/lib/sessionRecurrence'
import type { CreateSessionRequest, CreateSessionSeriesRequest, SessionDetail, SessionScopeOption, UpdateSessionRequest } from '../model/sessionTypes'

const datePattern = /^\d{2}\/\d{2}\/\d{4}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const sessionFormSchema = z
  .object({
    scopeKey: z.string().min(1, 'Chọn phạm vi của buổi.'),
    title: z.string().trim().min(3, 'Tên buổi cần ít nhất 3 ký tự.').max(150, 'Tên tối đa 150 ký tự.'),
    description: z.string().trim().max(3000, 'Nội dung tối đa 3000 ký tự.'),
    startDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    startTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    endDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    endTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    location: z.string().trim().min(1, 'Nhập địa điểm.').max(200, 'Địa điểm tối đa 200 ký tự.'),
    capacity: z.string().trim(),
    deadlineDate: z.string().trim(),
    deadlineTime: z.string().trim(),
    /** FR-ATT-02: `NONE` là buổi đơn lẻ; sửa một buổi luôn là `NONE`. */
    repeat: z.enum(['NONE', 'WEEKLY', 'MONTHLY']),
    untilDate: z.string().trim(),
  })
  .superRefine((values, context) => {
    const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message })
    const start = parseVnDateTime(values.startDate, values.startTime)
    const end = parseVnDateTime(values.endDate, values.endTime)
    if (datePattern.test(values.startDate) && start === null) issue('startDate', 'Ngày không tồn tại.')
    if (datePattern.test(values.endDate) && end === null) issue('endDate', 'Ngày không tồn tại.')
    if (start && Date.parse(start) <= Date.now()) issue('startDate', 'Buổi phải bắt đầu sau thời điểm hiện tại.')
    if (start && end && Date.parse(end) <= Date.parse(start)) issue('endDate', 'Kết thúc phải sau bắt đầu.')
    if (values.capacity && !/^[1-9]\d{0,4}$/.test(values.capacity)) issue('capacity', 'Số chỗ là số nguyên dương, để trống nếu không giới hạn.')
    if (values.deadlineDate || values.deadlineTime) {
      if (!datePattern.test(values.deadlineDate) || !timePattern.test(values.deadlineTime)) {
        issue('deadlineDate', 'Nhập đủ ngày (dd/mm/yyyy) và giờ (hh:mm), hoặc để trống cả hai.')
      } else {
        const deadline = parseVnDateTime(values.deadlineDate, values.deadlineTime)
        if (deadline === null) issue('deadlineDate', 'Ngày không tồn tại.')
        else if (start && Date.parse(deadline) > Date.parse(start)) issue('deadlineDate', 'Hạn đăng ký phải trước giờ bắt đầu.')
      }
    }
    if (values.repeat !== 'NONE' && start) {
      const until = datePattern.test(values.untilDate) ? parseVnDate(values.untilDate) : null
      const message = until ? recurrenceError(vnDayOf(start), values.repeat, until) : 'Nhập ngày kết thúc chuỗi dạng dd/mm/yyyy.'
      if (message) issue('untilDate', message)
    }
  })

export type SessionFormValues = z.infer<typeof sessionFormSchema>

/** Khóa của một phạm vi trong ô chọn: `CLUB` hoặc mã ban. */
export const scopeKeyOf = (scope: Pick<SessionScopeOption, 'type' | 'departmentId'>) => (scope.type === 'CLUB' ? 'CLUB' : (scope.departmentId ?? ''))

/** Ngày diễn ra các buổi của chuỗi để xem trước; rỗng khi chưa nhập đủ hoặc không lặp. */
export function previewSeriesDays(values: Pick<SessionFormValues, 'repeat' | 'startDate' | 'startTime' | 'untilDate'>): string[] {
  if (values.repeat === 'NONE') return []
  const start = parseVnDateTime(values.startDate, values.startTime)
  const until = parseVnDate(values.untilDate)
  return start && until ? recurrenceDays(vnDayOf(start), values.repeat, until) : []
}

export function toCreateSeriesRequest(values: SessionFormValues): CreateSessionSeriesRequest {
  return {
    ...toCreateSessionRequest(values),
    recurrence: { frequency: values.repeat as RecurrenceFrequency, until: parseVnDate(values.untilDate) ?? '' },
  }
}

/** Giá trị form của một buổi có sẵn, để sửa riêng buổi đó. */
export function toSessionFormValues(session: SessionDetail): SessionFormValues {
  return {
    scopeKey: scopeKeyOf({ type: session.scope.type, departmentId: session.scope.departmentId }),
    title: session.title,
    description: session.description,
    startDate: formatDate(session.startAt),
    startTime: formatTime(session.startAt),
    endDate: formatDate(session.endAt),
    endTime: formatTime(session.endAt),
    location: session.location,
    capacity: session.capacity === null ? '' : String(session.capacity),
    deadlineDate: session.registrationDeadline ? formatDate(session.registrationDeadline) : '',
    deadlineTime: session.registrationDeadline ? formatTime(session.registrationDeadline) : '',
    repeat: 'NONE',
    untilDate: '',
  }
}

export function toUpdateSessionRequest(values: SessionFormValues, version: number): UpdateSessionRequest {
  const { title, description, startAt, endAt, location, capacity, registrationDeadline } = toCreateSessionRequest(values)
  return { title, description, startAt, endAt, location, capacity, registrationDeadline, version }
}

export function toCreateSessionRequest(values: SessionFormValues): CreateSessionRequest {
  const club = values.scopeKey === 'CLUB'
  return {
    scopeType: club ? 'CLUB' : 'DEPARTMENT',
    departmentId: club ? null : values.scopeKey,
    title: values.title,
    description: values.description,
    startAt: parseVnDateTime(values.startDate, values.startTime) ?? '',
    endAt: parseVnDateTime(values.endDate, values.endTime) ?? '',
    location: values.location,
    capacity: values.capacity ? Number(values.capacity) : null,
    registrationDeadline: values.deadlineDate ? parseVnDateTime(values.deadlineDate, values.deadlineTime) : null,
  }
}
