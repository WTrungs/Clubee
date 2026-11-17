import { z } from 'zod'
import { parseVnDateTime } from '@/shared/format/formatDate'
import type { CreateSessionRequest, SessionScopeOption } from '../model/sessionTypes'

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
  })

export type SessionFormValues = z.infer<typeof sessionFormSchema>

/** Khóa của một phạm vi trong ô chọn: `CLUB` hoặc mã ban. */
export const scopeKeyOf = (scope: Pick<SessionScopeOption, 'type' | 'departmentId'>) => (scope.type === 'CLUB' ? 'CLUB' : (scope.departmentId ?? ''))

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
