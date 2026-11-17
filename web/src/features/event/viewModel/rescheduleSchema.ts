import { z } from 'zod'
import { formatDate, formatTime, parseVnDateTime } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import type { EventDetail, RescheduleEventRequest } from '../model/eventTypes'

const datePattern = /^\d{2}\/\d{2}\/\d{4}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

/** FR-EVT-14: giờ mới sau hiện tại, kết thúc sau bắt đầu, hạn đăng ký (nếu có) không sau giờ bắt đầu mới, lý do bắt buộc. */
export const rescheduleSchema = z
  .object({
    startDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    startTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    endDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    endTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    deadlineDate: z.string().trim(),
    deadlineTime: z.string().trim(),
    reason: z.string().trim().min(REASON_MIN, `Nhập lý do ít nhất ${REASON_MIN} ký tự.`).max(REASON_MAX, `Lý do tối đa ${REASON_MAX} ký tự.`),
  })
  .superRefine((values, context) => {
    const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message })
    // Ô sai dạng đã có lỗi riêng; chỉ báo ngày không tồn tại khi cả ngày và giờ đều đúng dạng.
    const parse = (date: string, time: string) => (datePattern.test(date) && timePattern.test(time) ? { at: parseVnDateTime(date, time) } : null)
    const start = parse(values.startDate, values.startTime)
    const end = parse(values.endDate, values.endTime)
    if (start?.at === null) issue('startDate', 'Ngày không tồn tại.')
    else if (start?.at && Date.parse(start.at) <= Date.now()) issue('startDate', 'Giờ bắt đầu mới phải sau thời điểm hiện tại.')
    if (end?.at === null) issue('endDate', 'Ngày không tồn tại.')
    else if (end?.at && start?.at && Date.parse(end.at) <= Date.parse(start.at)) issue('endDate', 'Kết thúc phải sau bắt đầu.')
    if (!values.deadlineDate && !values.deadlineTime) return
    if (!datePattern.test(values.deadlineDate) || !timePattern.test(values.deadlineTime)) {
      issue('deadlineDate', 'Nhập đủ ngày (dd/mm/yyyy) và giờ (hh:mm), hoặc để trống cả hai.')
      return
    }
    const deadline = parseVnDateTime(values.deadlineDate, values.deadlineTime)
    if (deadline === null) issue('deadlineDate', 'Ngày không tồn tại.')
    else if (start?.at && Date.parse(deadline) > Date.parse(start.at)) issue('deadlineDate', 'Hạn đăng ký không được sau giờ bắt đầu mới.')
  })

export type RescheduleValues = z.infer<typeof rescheduleSchema>

/** Điền sẵn giờ hiện tại của sự kiện để người dùng chỉ sửa phần cần đổi. */
export function rescheduleDefaults(event: Pick<EventDetail, 'startAt' | 'endAt' | 'registrationDeadline'>): RescheduleValues {
  const deadline = event.registrationDeadline
  return {
    startDate: formatDate(event.startAt),
    startTime: formatTime(event.startAt),
    endDate: formatDate(event.endAt),
    endTime: formatTime(event.endAt),
    deadlineDate: deadline ? formatDate(deadline) : '',
    deadlineTime: deadline ? formatTime(deadline) : '',
    reason: '',
  }
}

/** Gửi hạn đăng ký rõ ràng (kể cả null) để máy chủ không giữ hạn cũ mà người dùng đã xóa. */
export function toRescheduleRequest(values: RescheduleValues): Omit<RescheduleEventRequest, 'version'> {
  return {
    startAt: parseVnDateTime(values.startDate, values.startTime) ?? '',
    endAt: parseVnDateTime(values.endDate, values.endTime) ?? '',
    registrationDeadline: values.deadlineDate ? parseVnDateTime(values.deadlineDate, values.deadlineTime) : null,
    reason: values.reason.trim(),
  }
}

/** Giờ bắt đầu và kết thúc mới trùng giờ hiện tại thì không phải dời. */
export const sameSchedule = (event: Pick<EventDetail, 'startAt' | 'endAt'>, request: Pick<RescheduleEventRequest, 'startAt' | 'endAt'>) =>
  Date.parse(request.startAt) === Date.parse(event.startAt) && Date.parse(request.endAt) === Date.parse(event.endAt)
