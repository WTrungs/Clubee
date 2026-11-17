import { z } from 'zod'
import { formatDate, formatTime, parseVnDateTime } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import type { TaskDetail } from '../model/taskTypes'

const reason = z
  .string()
  .trim()
  .min(REASON_MIN, `Nhập lý do ít nhất ${REASON_MIN} ký tự.`)
  .max(REASON_MAX, `Lý do tối đa ${REASON_MAX} ký tự.`)

/** FR-TASK-05: đổi người chính, người phối hợp; lý do bắt buộc. */
export const reassignSchema = z
  .object({ ownerId: z.string().min(1, 'Chọn người chính.'), collaboratorIds: z.array(z.string()), reason })
  .superRefine((values, context) => {
    if (values.collaboratorIds.includes(values.ownerId)) {
      context.addIssue({ code: 'custom', path: ['collaboratorIds'], message: 'Người phối hợp phải khác người chính.' })
    }
  })
export type ReassignValues = z.infer<typeof reassignSchema>

/** FR-TASK-05: đổi hạn; hạn mới phải sau hiện tại, lý do bắt buộc. */
export const changeDueSchema = z
  .object({
    dueDate: z.string().trim().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Nhập ngày dạng dd/mm/yyyy.'),
    dueTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Nhập giờ dạng hh:mm.'),
    reason,
  })
  .superRefine((values, context) => {
    const dueAt = parseVnDateTime(values.dueDate, values.dueTime)
    if (dueAt === null) context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Ngày không tồn tại.' })
    else if (Date.parse(dueAt) <= Date.now()) context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Hạn mới phải sau thời điểm hiện tại.' })
  })
export type ChangeDueValues = z.infer<typeof changeDueSchema>

export const reassignDefaults = (task: Pick<TaskDetail, 'owner' | 'collaborators'>): ReassignValues => ({
  ownerId: task.owner.id,
  collaboratorIds: task.collaborators.map((person) => person.id),
  reason: '',
})

export const changeDueDefaults = (task: Pick<TaskDetail, 'dueAt'>): ChangeDueValues => ({ dueDate: formatDate(task.dueAt), dueTime: formatTime(task.dueAt), reason: '' })

/** Người chính và tập người phối hợp có khác giá trị hiện tại không. */
export function reassignChanged(task: Pick<TaskDetail, 'owner' | 'collaborators'>, values: Pick<ReassignValues, 'ownerId' | 'collaboratorIds'>): boolean {
  const current = task.collaborators.map((person) => person.id)
  const sameCollaborators = current.length === values.collaboratorIds.length && current.every((id) => values.collaboratorIds.includes(id))
  return values.ownerId !== task.owner.id || !sameCollaborators
}
