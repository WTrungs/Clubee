import { z } from 'zod'
import { parseVnDateTime } from '@/shared/format/formatDate'

export const assignTaskSchema = z
  .object({
    title: z.string().trim().min(3, 'Tên việc cần ít nhất 3 ký tự.').max(200, 'Tên việc tối đa 200 ký tự.'),
    description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự.'),
    scopeKey: z.string().min(1, 'Chọn ban hoặc tiểu ban.'),
    ownerId: z.string().min(1, 'Chọn người chính.'),
    collaboratorIds: z.array(z.string()),
    dueDate: z.string().trim().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Nhập ngày dạng dd/mm/yyyy.'),
    dueTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Nhập giờ dạng hh:mm.'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  })
  .superRefine((values, context) => {
    const dueAt = parseVnDateTime(values.dueDate, values.dueTime)
    if (dueAt === null) {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Ngày không tồn tại.' })
    } else if (Date.parse(dueAt) <= Date.now()) {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Hạn phải sau thời điểm hiện tại.' })
    }
    if (values.collaboratorIds.includes(values.ownerId)) {
      context.addIssue({ code: 'custom', path: ['collaboratorIds'], message: 'Người phối hợp phải khác người chính.' })
    }
  })

export type AssignTaskValues = z.infer<typeof assignTaskSchema>

/** Khóa chọn phạm vi trong form: "DEPARTMENT:d-media". */
export const scopeKeyOf = (scope: { type: string; id: string }) => `${scope.type}:${scope.id}`
