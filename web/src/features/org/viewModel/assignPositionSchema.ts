import { z } from 'zod'
import { parseVnDate } from '@/shared/format/formatDate'
import { needsDepartment, STANDING_ROLES } from './orgDisplay'

const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/
const dateText = z.string().trim().regex(DATE_TEXT, 'Nhập ngày dạng dd/mm/yyyy.')

/** FR-ORG-02: ngày nằm trong nhiệm kỳ, kết thúc không trước bắt đầu (BR-ORG-03); trưởng, phó ban cần chọn ban. */
export function assignPositionSchema(term: { startOn: string; endOn: string }) {
  return z
    .object({
      role: z.enum(STANDING_ROLES, { message: 'Chọn chức vụ.' }),
      departmentId: z.string(),
      userId: z.string().min(1, 'Chọn người giữ chức vụ.'),
      startDate: dateText,
      endDate: dateText,
    })
    .superRefine((values, context) => {
      if (needsDepartment(values.role) && !values.departmentId) {
        context.addIssue({ code: 'custom', path: ['departmentId'], message: 'Chọn ban.' })
      }
      const start = parseVnDate(values.startDate)
      const end = parseVnDate(values.endDate)
      if (DATE_TEXT.test(values.startDate) && (!start || start < term.startOn || start > term.endOn)) {
        context.addIssue({ code: 'custom', path: ['startDate'], message: 'Ngày bắt đầu phải nằm trong nhiệm kỳ hiện tại.' })
      }
      if (DATE_TEXT.test(values.endDate) && (!end || end > term.endOn || (start !== null && end < start))) {
        context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ngày kết thúc phải sau ngày bắt đầu và không quá ngày cuối nhiệm kỳ.' })
      }
    })
}

export type AssignPositionValues = z.infer<ReturnType<typeof assignPositionSchema>>

/** FR-ORG-03: thu hồi bắt buộc lý do và ngày chuyển giao, từ hôm nay đến hết hạn của chức vụ. */
export function revokePositionSchema(today: string, lastDay: string | null) {
  return z
    .object({
      reason: z.string().trim().min(5, 'Nhập ít nhất 5 ký tự.').max(500, 'Lý do tối đa 500 ký tự.'),
      handoverDate: dateText,
    })
    .superRefine((values, context) => {
      const handover = parseVnDate(values.handoverDate)
      if (DATE_TEXT.test(values.handoverDate) && (!handover || handover < today || (lastDay !== null && handover > lastDay))) {
        context.addIssue({ code: 'custom', path: ['handoverDate'], message: 'Ngày chuyển giao từ hôm nay đến hết hạn của chức vụ.' })
      }
    })
}

export type RevokePositionValues = z.infer<ReturnType<typeof revokePositionSchema>>
