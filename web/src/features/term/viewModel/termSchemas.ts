import { z } from 'zod'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import type { DepartmentPlanEntry, DepartmentPlanEntryRequest, Term } from '../model/termTypes'

export const TERM_NAME_MAX = 80
export const PLAN_NAME_MAX = 80
export const PLAN_DESCRIPTION_MAX = 500
export const PLAN_MAX_ENTRIES = 50

const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/
const dateText = z.string().trim().regex(DATE_TEXT, 'Nhập ngày dạng dd/mm/yyyy.')

/** FR-TERM-01, BR-TERM-01: ngày kết thúc sau ngày bắt đầu và sau hôm nay (`today` dạng yyyy-mm-dd). */
export function termFormSchema(today: string) {
  return z
    .object({
      name: z.string().trim().min(3, 'Tên nhiệm kỳ cần ít nhất 3 ký tự.').max(TERM_NAME_MAX, `Tên nhiệm kỳ tối đa ${TERM_NAME_MAX} ký tự.`),
      startDate: dateText,
      endDate: dateText,
    })
    .superRefine((values, context) => {
      const start = parseVnDate(values.startDate)
      const end = parseVnDate(values.endDate)
      if (DATE_TEXT.test(values.startDate) && !start) context.addIssue({ code: 'custom', path: ['startDate'], message: 'Ngày này không tồn tại.' })
      if (!DATE_TEXT.test(values.endDate)) return
      if (!end) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ngày này không tồn tại.' })
      else if (start && end <= start) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ngày kết thúc phải sau ngày bắt đầu.' })
      else if (end <= today) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ngày kết thúc phải sau hôm nay.' })
    })
}

export type TermFormValues = z.infer<ReturnType<typeof termFormSchema>>

export function toTermFormValues(term: Pick<Term, 'name' | 'startOn' | 'endOn'> | null): TermFormValues {
  return term ? { name: term.name, startDate: formatDate(term.startOn), endDate: formatDate(term.endOn) } : { name: '', startDate: '', endDate: '' }
}

/** Chỉ gọi sau khi schema đã chấp nhận, nên hai ngày luôn đọc được. */
export function toTermDates(values: TermFormValues): { name: string; startOn: string; endOn: string } {
  return { name: values.name, startOn: parseVnDate(values.startDate) ?? '', endOn: parseVnDate(values.endDate) ?? '' }
}

/** Kế hoạch ban (FR-TERM-01): ban không bị bỏ cần tên 2–80 ký tự và không trùng nhau. */
export const departmentPlanSchema = z
  .object({
    entries: z
      .array(
        z.object({
          entryId: z.string().nullable(),
          departmentId: z.string().nullable(),
          name: z.string().trim(),
          description: z.string().trim().max(PLAN_DESCRIPTION_MAX, `Mô tả tối đa ${PLAN_DESCRIPTION_MAX} ký tự.`),
          dropped: z.boolean(),
        }),
      )
      .max(PLAN_MAX_ENTRIES, `Kế hoạch ban có tối đa ${PLAN_MAX_ENTRIES} dòng.`),
  })
  .superRefine((values, context) => {
    const names = new Set<string>()
    values.entries.forEach((entry, index) => {
      if (entry.dropped) return
      const path = ['entries', index, 'name']
      if (entry.name.length < 2) context.addIssue({ code: 'custom', path, message: 'Tên ban cần ít nhất 2 ký tự.' })
      else if (entry.name.length > PLAN_NAME_MAX) context.addIssue({ code: 'custom', path, message: `Tên ban tối đa ${PLAN_NAME_MAX} ký tự.` })
      else if (names.has(entry.name.toLowerCase())) context.addIssue({ code: 'custom', path, message: 'Kế hoạch đã có ban trùng tên.' })
      names.add(entry.name.toLowerCase())
    })
  })

export type DepartmentPlanValues = z.infer<typeof departmentPlanSchema>
export type PlanEntryValues = DepartmentPlanValues['entries'][number]

export function toPlanValues(plan: DepartmentPlanEntry[]): DepartmentPlanValues {
  return { entries: plan.map((entry) => ({ entryId: entry.id, departmentId: entry.departmentId, name: entry.name, description: entry.description, dropped: entry.dropped })) }
}

export function toPlanRequest(values: DepartmentPlanValues): DepartmentPlanEntryRequest[] {
  return values.entries.map((entry) => ({ id: entry.entryId, departmentId: entry.departmentId, name: entry.name, description: entry.description, dropped: entry.dropped }))
}

export const NEW_PLAN_ENTRY: PlanEntryValues = { entryId: null, departmentId: null, name: '', description: '', dropped: false }

const SERVER_PLAN_FIELD = /^departmentPlan\[(\d+)\]\.(name|description|dropped)$/

/** Đổi tên trường lỗi của máy chủ (`departmentPlan[0].name`) sang đường dẫn ô trong form (`entries.0.name`). */
export function planFieldPath(serverField: string): `entries.${number}.${'name' | 'description' | 'dropped'}` | null {
  const match = SERVER_PLAN_FIELD.exec(serverField)
  if (!match) return null
  return `entries.${Number(match[1])}.${match[2] as 'name' | 'description' | 'dropped'}`
}
