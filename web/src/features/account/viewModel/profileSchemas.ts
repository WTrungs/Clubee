import { z } from 'zod'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import type { Profile, UpdateProfileRequest } from '../model/accountTypes'
import { email, newPassword } from './accountSchemas'

const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/
const PHONE_PATTERN = /^0\d{9}$/
const EARLIEST_BIRTH_DATE = '1900-01-01'

/** Bỏ dấu cách, dấu chấm, gạch ngang người dùng hay gõ giữa các nhóm số. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.-]/g, '')
}

/** FR-ACC-05: họ tên, SĐT (10 số, bắt đầu bằng 0), ngày sinh trước hôm nay; SĐT và ngày sinh được để trống. */
export function profileSchema(today: string) {
  return z
    .object({
      fullName: z.string().trim().min(2, 'Họ tên cần ít nhất 2 ký tự.').max(100, 'Họ tên tối đa 100 ký tự.'),
      phone: z
        .string()
        .trim()
        .refine((value) => value === '' || PHONE_PATTERN.test(normalizePhone(value)), 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'),
      birthDate: z
        .string()
        .trim()
        .refine((value) => value === '' || DATE_TEXT.test(value), 'Nhập ngày dạng dd/mm/yyyy.'),
    })
    .superRefine((values, context) => {
      if (!DATE_TEXT.test(values.birthDate)) return
      const birthDate = parseVnDate(values.birthDate)
      if (!birthDate || birthDate < EARLIEST_BIRTH_DATE || birthDate >= today) {
        context.addIssue({ code: 'custom', path: ['birthDate'], message: 'Ngày sinh phải là một ngày có thật trước hôm nay.' })
      }
    })
}

export type ProfileValues = z.infer<ReturnType<typeof profileSchema>>

export function toProfileValues(profile: Profile): ProfileValues {
  return { fullName: profile.fullName, phone: profile.phone ?? '', birthDate: profile.birthDate ? formatDate(profile.birthDate) : '' }
}

export function toUpdateProfileRequest(values: ProfileValues, version: number): UpdateProfileRequest {
  const phone = values.phone.trim()
  return {
    fullName: values.fullName.trim(),
    phone: phone === '' ? null : normalizePhone(phone),
    birthDate: values.birthDate.trim() === '' ? null : parseVnDate(values.birthDate),
    version,
  }
}

/** Đổi email cần mật khẩu hiện tại để người khác cầm máy không đổi được tài khoản. */
export const emailChangeSchema = z.object({
  newEmail: email,
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại.'),
})

export type EmailChangeValues = z.infer<typeof emailChangeSchema>

/** FR-ACC-04: yêu cầu mật khẩu cũ; mật khẩu mới khác mật khẩu cũ và được nhập lại khớp. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại.'),
    newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới.'),
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmPassword) {
      context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Mật khẩu nhập lại không khớp.' })
    }
    if (values.currentPassword !== '' && values.newPassword === values.currentPassword) {
      context.addIssue({ code: 'custom', path: ['newPassword'], message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' })
    }
  })

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
