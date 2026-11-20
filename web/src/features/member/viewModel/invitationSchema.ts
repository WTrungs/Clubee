import { z } from 'zod'
import { isEmail } from '@/shared/lib/contactRules'

export const INVITATION_EMAIL_MAX = 254

/** FR-MEM-01: email người được mời; máy chủ còn kiểm người đó đã là thành viên hay đã có lời mời còn hiệu lực. */
export const invitationEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Nhập email người được mời.')
    .max(INVITATION_EMAIL_MAX, `Email tối đa ${INVITATION_EMAIL_MAX} ký tự.`)
    .refine((value) => value === '' || isEmail(value), 'Email không hợp lệ.'),
})
export type InvitationEmailValues = z.infer<typeof invitationEmailSchema>
