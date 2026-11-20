import { z } from 'zod'
import { parseVnDateTime } from '@/shared/format/formatDate'

const datePattern = /^\d{2}\/\d{2}\/\d{4}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const eventFormSchema = z
  .object({
    name: z.string().trim().min(3, 'Tên sự kiện cần ít nhất 3 ký tự.').max(150, 'Tên tối đa 150 ký tự.'),
    description: z.string().trim().max(3000, 'Mô tả tối đa 3000 ký tự.'),
    startDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    startTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    endDate: z.string().trim().regex(datePattern, 'Nhập ngày dạng dd/mm/yyyy.'),
    endTime: z.string().trim().regex(timePattern, 'Nhập giờ dạng hh:mm.'),
    format: z.enum(['OFFLINE', 'ONLINE']),
    location: z.string().trim().max(200, 'Địa điểm tối đa 200 ký tự.'),
    onlineUrl: z.string().trim(),
    capacity: z.string().trim(),
    deadlineDate: z.string().trim(),
    deadlineTime: z.string().trim(),
    openToGuests: z.boolean(),
    leadUserId: z.string(),
  })
  .superRefine((values, context) => {
    const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message })
    const start = parseVnDateTime(values.startDate, values.startTime)
    const end = parseVnDateTime(values.endDate, values.endTime)
    if (start === null) issue('startDate', 'Ngày không tồn tại.')
    if (end === null) issue('endDate', 'Ngày không tồn tại.')
    if (start && Date.parse(start) <= Date.now()) issue('startDate', 'Sự kiện phải bắt đầu sau thời điểm hiện tại.')
    if (start && end && Date.parse(end) <= Date.parse(start)) issue('endDate', 'Kết thúc phải sau bắt đầu.')
    if (values.format === 'OFFLINE' && !values.location) issue('location', 'Nhập địa điểm tổ chức.')
    if (values.format === 'ONLINE' && !/^https?:\/\/\S+$/.test(values.onlineUrl)) issue('onlineUrl', 'Nhập liên kết bắt đầu bằng http:// hoặc https://.')
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

export type EventFormValues = z.infer<typeof eventFormSchema>

/** Ban chủ nhiệm tạo sự kiện thì bắt buộc chỉ định Trưởng BTC (FR-EVT-01). */
export const createEventFormSchema = eventFormSchema.refine((values) => values.leadUserId !== '', {
  path: ['leadUserId'],
  message: 'Chọn Trưởng BTC.',
})
