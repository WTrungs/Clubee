import { z } from 'zod'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import { DISPLAY_TITLE_MAX, INTERNAL_NOTE_MAX, STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'
import type { MemberDetail, UpdateMemberInfoRequest } from '../model/memberTypes'

const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/

export { DISPLAY_TITLE_MAX, INTERNAL_NOTE_MAX }

interface MemberInfoContext {
  today: string
  foundedOn: string
  collectsStudentId: boolean
}

/** FR-MEM-05: kiểm ở máy khách giống máy chủ; ràng buộc theo chức vụ, lần rời trước do máy chủ kiểm. */
export function memberInfoSchema({ today, foundedOn, collectsStudentId }: MemberInfoContext) {
  return z
    .object({
      displayTitle: z.string().trim().max(DISPLAY_TITLE_MAX, `Chức danh tối đa ${DISPLAY_TITLE_MAX} ký tự.`),
      internalNote: z.string().trim().max(INTERNAL_NOTE_MAX, `Ghi chú tối đa ${INTERNAL_NOTE_MAX} ký tự.`),
      studentId: z
        .string()
        .trim()
        .refine((value) => !collectsStudentId || value === '' || STUDENT_ID_PATTERN.test(value), STUDENT_ID_MESSAGE),
      joinedOn: z
        .string()
        .trim()
        .min(1, 'Nhập ngày gia nhập.')
        .refine((value) => value === '' || DATE_TEXT.test(value), 'Nhập ngày dạng dd/mm/yyyy.'),
    })
    .superRefine((values, context) => {
      if (!DATE_TEXT.test(values.joinedOn)) return
      const joinedOn = parseVnDate(values.joinedOn)
      const issue = (message: string) => context.addIssue({ code: 'custom', path: ['joinedOn'], message })
      if (!joinedOn) issue('Ngày gia nhập không hợp lệ.')
      else if (joinedOn > today) issue('Ngày gia nhập không được sau hôm nay.')
      else if (joinedOn < foundedOn) issue(`Ngày gia nhập không được trước ngày thành lập CLB (${formatDate(foundedOn)}).`)
    })
}

export type MemberInfoValues = z.infer<ReturnType<typeof memberInfoSchema>>

export function toMemberInfoValues(member: Pick<MemberDetail, 'displayTitle' | 'internalNote' | 'studentId' | 'joinedOn'>): MemberInfoValues {
  return {
    displayTitle: member.displayTitle ?? '',
    internalNote: member.internalNote ?? '',
    studentId: member.studentId ?? '',
    joinedOn: member.joinedOn ? formatDate(member.joinedOn) : '',
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

export function toUpdateMemberInfoRequest(values: MemberInfoValues, version: number): UpdateMemberInfoRequest {
  return {
    displayTitle: orNull(values.displayTitle),
    internalNote: orNull(values.internalNote),
    studentId: orNull(values.studentId),
    joinedOn: parseVnDate(values.joinedOn) ?? '',
    version,
  }
}
