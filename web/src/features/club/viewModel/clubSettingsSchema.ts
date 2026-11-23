import { z } from 'zod'
import { formatMoneyInput, parseMoney } from '@/shared/format/formatMoney'
import { CLUB_SETTING_MESSAGES, formatMonthDay, inRange, parseMonthDay, semesterErrors, type NumericClubSetting } from '@/shared/lib/clubSettingsRules'
import type { ClubSettings, UpdateClubSettingsRequest } from '../model/clubTypes'

/** Ô số đếm chỉ nhận chữ số liền, tối đa 4 chữ số; còn lại trả null. */
export function parseCount(text: string): number | null {
  const compact = text.trim()
  return /^\d{1,4}$/.test(compact) ? Number(compact) : null
}

const countField = (setting: Exclude<NumericClubSetting, 'expenseReceiptThreshold'>) =>
  z.string().refine((text) => inRange(setting, parseCount(text)), CLUB_SETTING_MESSAGES[setting])

/** Mốc nhập sai gửi đi một giá trị chắc chắn không hợp lệ để luật dùng chung báo đúng ô. */
const monthDayOrInvalid = (text: string) => parseMonthDay(text) ?? 'invalid'

/** FR-CLB-03: các tham số cấp CLB đang dùng; khoảng hợp lệ và mốc học kỳ dùng chung với máy chủ. */
export const clubSettingsSchema = z
  .object({
    probationStep: z.boolean(),
    inviteLinkDays: countField('inviteLinkDays'),
    registrationCancelHours: countField('registrationCancelHours'),
    rescheduleConfirmHours: countField('rescheduleConfirmHours'),
    attendanceLeadMinutes: countField('attendanceLeadMinutes'),
    attendanceQrRotateSeconds: countField('attendanceQrRotateSeconds'),
    attendanceEditHours: countField('attendanceEditHours'),
    taskReminderDays: countField('taskReminderDays'),
    expenseReceiptThreshold: z.string().refine((text) => inRange('expenseReceiptThreshold', parseMoney(text)), CLUB_SETTING_MESSAGES.expenseReceiptThreshold),
    advanceSettleDays: countField('advanceSettleDays'),
    semester1Start: z.string(),
    semester2Start: z.string(),
    splitSummer: z.boolean(),
    summerStart: z.string(),
  })
  .superRefine((values, context) => {
    const errors = semesterErrors({
      semester1Start: monthDayOrInvalid(values.semester1Start),
      semester2Start: monthDayOrInvalid(values.semester2Start),
      summerStart: values.splitSummer ? monthDayOrInvalid(values.summerStart) : null,
    })
    for (const error of errors) context.addIssue({ code: 'custom', path: [error.field], message: error.message })
  })
export type ClubSettingsFormValues = z.infer<typeof clubSettingsSchema>

/** Mốc kỳ hè gợi ý khi người dùng bật tách kỳ hè lần đầu. */
const SUMMER_SUGGESTION = '01/07'

export function toClubSettingsFormValues(settings: ClubSettings): ClubSettingsFormValues {
  return {
    probationStep: settings.probationStep,
    inviteLinkDays: String(settings.inviteLinkDays),
    registrationCancelHours: String(settings.registrationCancelHours),
    rescheduleConfirmHours: String(settings.rescheduleConfirmHours),
    attendanceLeadMinutes: String(settings.attendanceLeadMinutes),
    attendanceQrRotateSeconds: String(settings.attendanceQrRotateSeconds),
    attendanceEditHours: String(settings.attendanceEditHours),
    taskReminderDays: String(settings.taskReminderDays),
    expenseReceiptThreshold: formatMoneyInput(String(settings.expenseReceiptThreshold)),
    advanceSettleDays: String(settings.advanceSettleDays),
    semester1Start: formatMonthDay(settings.semester1Start),
    semester2Start: formatMonthDay(settings.semester2Start),
    splitSummer: settings.summerStart !== null,
    summerStart: settings.summerStart ? formatMonthDay(settings.summerStart) : SUMMER_SUGGESTION,
  }
}

export function toUpdateClubSettingsRequest(values: ClubSettingsFormValues, version: number): UpdateClubSettingsRequest {
  return {
    probationStep: values.probationStep,
    inviteLinkDays: parseCount(values.inviteLinkDays) ?? 0,
    registrationCancelHours: parseCount(values.registrationCancelHours) ?? 0,
    rescheduleConfirmHours: parseCount(values.rescheduleConfirmHours) ?? 0,
    attendanceLeadMinutes: parseCount(values.attendanceLeadMinutes) ?? 0,
    attendanceQrRotateSeconds: parseCount(values.attendanceQrRotateSeconds) ?? 0,
    attendanceEditHours: parseCount(values.attendanceEditHours) ?? 0,
    taskReminderDays: parseCount(values.taskReminderDays) ?? 0,
    expenseReceiptThreshold: parseMoney(values.expenseReceiptThreshold) ?? 0,
    advanceSettleDays: parseCount(values.advanceSettleDays) ?? 0,
    semester1Start: parseMonthDay(values.semester1Start) ?? '',
    semester2Start: parseMonthDay(values.semester2Start) ?? '',
    summerStart: values.splitSummer ? (parseMonthDay(values.summerStart) ?? '') : null,
    version,
  }
}
