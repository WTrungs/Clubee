import { z } from 'zod'

export const DEPARTMENT_NAME_MAX = 80
export const DEPARTMENT_DESCRIPTION_MAX = 500

/** FR-ORG-01: tên ban 2–80 ký tự, mô tả không bắt buộc. */
export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Tên ban cần ít nhất 2 ký tự.').max(DEPARTMENT_NAME_MAX, `Tên ban tối đa ${DEPARTMENT_NAME_MAX} ký tự.`),
  description: z.string().trim().max(DEPARTMENT_DESCRIPTION_MAX, `Mô tả tối đa ${DEPARTMENT_DESCRIPTION_MAX} ký tự.`),
})

export type DepartmentValues = z.infer<typeof departmentSchema>
