import { z } from 'zod'
import { isContactPhone, isEmail, normalizePhone, safeHttpUrl } from '@/shared/lib/contactRules'
import type { ClubDetail, CreateClubRequest, UpdateClubRequest } from '../model/clubTypes'

export const CLUB_NAME_MAX = 100
export const CLUB_SHORT_NAME_MAX = 10
export const CLUB_FIELD_MAX = 50
export const CLUB_DESCRIPTION_MAX = 1000
export const CLUB_RULES_MAX = 5000

/** Gợi ý khi nhập lĩnh vực; SRS không có danh sách cố định nên vẫn gõ tự do được. */
export const CLUB_FIELD_SUGGESTIONS = ['Âm nhạc', 'Ngoại ngữ', 'Tình nguyện', 'Thể thao', 'Học thuật', 'Công nghệ', 'Nghệ thuật', 'Kỹ năng', 'Truyền thông', 'Văn hóa']

const basics = {
  name: z.string().trim().min(3, 'Tên CLB cần ít nhất 3 ký tự.').max(CLUB_NAME_MAX, `Tên CLB tối đa ${CLUB_NAME_MAX} ký tự.`),
  shortName: z.string().trim().min(2, 'Tên viết tắt cần 2–10 ký tự.').max(CLUB_SHORT_NAME_MAX, 'Tên viết tắt cần 2–10 ký tự.'),
  field: z.string().trim().min(2, 'Nhập lĩnh vực hoạt động.').max(CLUB_FIELD_MAX, `Lĩnh vực tối đa ${CLUB_FIELD_MAX} ký tự.`),
  description: z.string().trim().min(10, 'Mô tả cần ít nhất 10 ký tự.').max(CLUB_DESCRIPTION_MAX, `Mô tả tối đa ${CLUB_DESCRIPTION_MAX} ký tự.`),
}

/** FR-CLB-01: tên, tên viết tắt, lĩnh vực, mô tả. */
export const createClubSchema = z.object(basics)
export type CreateClubValues = z.infer<typeof createClubSchema>

export function toCreateClubRequest(values: CreateClubValues): CreateClubRequest {
  return { name: values.name.trim(), shortName: values.shortName.trim(), field: values.field.trim(), description: values.description.trim() }
}

/** FR-CLB-02: thêm liên hệ công khai (đều được để trống), nội quy và cờ thu thập MSSV. */
export const clubProfileSchema = z.object({
  ...basics,
  contactEmail: z
    .string()
    .trim()
    .refine((value) => value === '' || isEmail(value), 'Email không hợp lệ.'),
  contactPhone: z
    .string()
    .trim()
    .refine((value) => value === '' || isContactPhone(value), 'Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0.'),
  contactUrl: z
    .string()
    .trim()
    .max(200, 'Liên kết tối đa 200 ký tự.')
    .refine((value) => value === '' || safeHttpUrl(value) !== null, 'Liên kết phải bắt đầu bằng http:// hoặc https://.'),
  rules: z.string().max(CLUB_RULES_MAX, `Nội quy tối đa ${CLUB_RULES_MAX} ký tự.`),
  collectsStudentId: z.boolean(),
})
export type ClubProfileValues = z.infer<typeof clubProfileSchema>

export function toClubProfileValues(club: ClubDetail): ClubProfileValues {
  return {
    name: club.name,
    shortName: club.shortName,
    field: club.field,
    description: club.description,
    contactEmail: club.contactEmail ?? '',
    contactPhone: club.contactPhone ?? '',
    contactUrl: club.contactUrl ?? '',
    rules: club.rules,
    collectsStudentId: club.collectsStudentId,
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

export function toUpdateClubRequest(values: ClubProfileValues, version: number): UpdateClubRequest {
  return {
    ...toCreateClubRequest(values),
    contactEmail: orNull(values.contactEmail),
    contactPhone: orNull(normalizePhone(values.contactPhone)),
    contactUrl: orNull(values.contactUrl),
    rules: values.rules.trim(),
    collectsStudentId: values.collectsStudentId,
    version,
  }
}
