import { z } from 'zod'
import { needsDepartment, STANDING_ROLES } from '@/features/org/viewModel/orgDisplay'
import type { Appointment, AppointmentRequest } from '../model/handoverTypes'

export const APPOINTMENTS_MAX = 60

/** FR-TERM-03: mỗi dòng một chức vụ thường trực; trưởng, phó ban cần chọn ban; không trùng người ở cùng chức vụ. */
export const appointmentsSchema = z
  .object({
    rows: z
      .array(
        z.object({
          role: z.enum(STANDING_ROLES, { message: 'Chọn chức vụ.' }),
          departmentId: z.string(),
          userId: z.string().min(1, 'Chọn người được bầu.'),
        }),
      )
      .max(APPOINTMENTS_MAX, `Kết quả bầu có tối đa ${APPOINTMENTS_MAX} dòng.`),
  })
  .superRefine((values, context) => {
    const seen = new Set<string>()
    values.rows.forEach((row, index) => {
      const department = needsDepartment(row.role) ? row.departmentId : ''
      if (needsDepartment(row.role) && !row.departmentId) context.addIssue({ code: 'custom', path: ['rows', index, 'departmentId'], message: 'Chọn ban.' })
      if (!row.userId) return
      const key = `${row.role}|${department}|${row.userId}`
      if (seen.has(key)) context.addIssue({ code: 'custom', path: ['rows', index, 'userId'], message: 'Người này đã có cùng chức vụ ở dòng khác.' })
      seen.add(key)
    })
  })

export type AppointmentsValues = z.infer<typeof appointmentsSchema>
export type AppointmentRow = AppointmentsValues['rows'][number]

export const NEW_APPOINTMENT: AppointmentRow = { role: 'PRESIDENT', departmentId: '', userId: '' }

export function toAppointmentValues(appointments: Appointment[]): AppointmentsValues {
  return { rows: appointments.map((appointment) => ({ role: appointment.role, departmentId: appointment.department?.id ?? '', userId: appointment.person.id })) }
}

export function toAppointmentRequests(values: AppointmentsValues): AppointmentRequest[] {
  return values.rows.map((row) => ({ role: row.role, departmentId: needsDepartment(row.role) ? row.departmentId : null, userId: row.userId }))
}

const SERVER_FIELD = /^appointments\[(\d+)\]\.(role|departmentId|userId)$/

/** Đổi tên trường lỗi của máy chủ (`appointments[0].userId`) sang đường dẫn ô trong form (`rows.0.userId`). */
export function appointmentFieldPath(serverField: string): `rows.${number}.${'role' | 'departmentId' | 'userId'}` | null {
  const match = SERVER_FIELD.exec(serverField)
  if (!match) return null
  return `rows.${Number(match[1])}.${match[2] as 'role' | 'departmentId' | 'userId'}`
}
