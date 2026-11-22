import { z } from 'zod'

export const email = z.string().trim().min(1, 'Vui lòng nhập email.').pipe(z.email('Email không hợp lệ.'))
/** Mật khẩu mới khi đăng ký hoặc đổi mật khẩu (FR-ACC-01, 04). */
export const newPassword = z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').max(72, 'Mật khẩu tối đa 72 ký tự.')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Họ tên cần ít nhất 2 ký tự.').max(100, 'Họ tên tối đa 100 ký tự.'),
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp.',
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

/** FR-ACC-03: mật khẩu mới đặt qua liên kết trong email. */
export const resetPasswordSchema = z
  .object({
    newPassword,
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp.',
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

/** Độ mạnh mật khẩu 0–4 để hiện thanh gợi ý; chỉ mang tính hướng dẫn, máy chủ mới quyết định. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  return Math.max(1, Math.min(score, 4)) as 1 | 2 | 3 | 4
}
