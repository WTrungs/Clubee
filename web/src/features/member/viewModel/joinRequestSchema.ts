import { z } from 'zod'
import { STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'

export const INTRODUCTION_MIN = 10
export const INTRODUCTION_MAX = 500

/** FR-MEM-02: lời giới thiệu bắt buộc; MSSV bắt buộc khi CLB bật thu thập (SRS 9.2). */
export function joinRequestSchema(collectsStudentId: boolean) {
  return z.object({
    introduction: z
      .string()
      .trim()
      .min(INTRODUCTION_MIN, `Lời giới thiệu cần ít nhất ${INTRODUCTION_MIN} ký tự.`)
      .max(INTRODUCTION_MAX, `Lời giới thiệu tối đa ${INTRODUCTION_MAX} ký tự.`),
    studentId: collectsStudentId
      ? z.string().trim().min(1, 'Nhập MSSV vì CLB này có thu thập MSSV.').regex(STUDENT_ID_PATTERN, STUDENT_ID_MESSAGE)
      : z.string().trim(),
  })
}

export type JoinRequestValues = z.infer<ReturnType<typeof joinRequestSchema>>
