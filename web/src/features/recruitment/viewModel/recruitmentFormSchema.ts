import { z } from 'zod'
import { formatDate, formatTime, parseVnDateTime } from '@/shared/format/formatDate'
import {
  RECRUITMENT_DESCRIPTION_MAX,
  RECRUITMENT_JUDGES_MAX,
  RECRUITMENT_NAME_MAX,
  RECRUITMENT_NAME_MIN,
  RECRUITMENT_QUESTION_MAX,
  RECRUITMENT_QUESTION_MIN,
  RECRUITMENT_QUESTIONS_MAX,
  RECRUITMENT_QUOTA_MAX,
  RECRUITMENT_QUOTA_MIN,
  RECRUITMENT_ROUND_NAME_MAX,
  RECRUITMENT_ROUND_NAME_MIN,
  RECRUITMENT_ROUNDS_MAX,
  RECRUITMENT_ROUNDS_MIN,
} from '@/shared/lib/recruitmentRules'
import type { RecruitmentDetail, RecruitmentRequest } from '../model/recruitmentTypes'

const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/
const TIME_TEXT = /^\d{2}:\d{2}$/

/** FR-REC-01: thời gian, chỉ tiêu theo ban, 1–5 vòng, tối đa 20 câu hỏi, tối đa 20 giám khảo. */
export const recruitmentFormSchema = z
  .object({
    name: z.string().trim().min(RECRUITMENT_NAME_MIN, `Tên đợt tuyển cần ít nhất ${RECRUITMENT_NAME_MIN} ký tự.`).max(RECRUITMENT_NAME_MAX, `Tên tối đa ${RECRUITMENT_NAME_MAX} ký tự.`),
    description: z.string().trim().max(RECRUITMENT_DESCRIPTION_MAX, `Mô tả tối đa ${RECRUITMENT_DESCRIPTION_MAX} ký tự.`),
    opensDate: z.string().trim().regex(DATE_TEXT, 'Nhập ngày dạng dd/mm/yyyy.'),
    opensTime: z.string().trim().regex(TIME_TEXT, 'Nhập giờ dạng hh:mm.'),
    closesDate: z.string().trim().regex(DATE_TEXT, 'Nhập ngày dạng dd/mm/yyyy.'),
    closesTime: z.string().trim().regex(TIME_TEXT, 'Nhập giờ dạng hh:mm.'),
    quotas: z.array(z.object({ departmentId: z.string(), quota: z.string().trim() })).min(1, 'Khai báo chỉ tiêu cho ít nhất một ban.'),
    rounds: z
      .array(z.object({ id: z.string().nullable(), name: z.string().trim() }))
      .min(RECRUITMENT_ROUNDS_MIN, `Cần ít nhất ${RECRUITMENT_ROUNDS_MIN} vòng.`)
      .max(RECRUITMENT_ROUNDS_MAX, `Tối đa ${RECRUITMENT_ROUNDS_MAX} vòng.`),
    questions: z.array(z.object({ id: z.string().nullable(), text: z.string().trim(), required: z.boolean() })).max(RECRUITMENT_QUESTIONS_MAX, `Tối đa ${RECRUITMENT_QUESTIONS_MAX} câu hỏi.`),
    judgeIds: z.array(z.string()).max(RECRUITMENT_JUDGES_MAX, `Tối đa ${RECRUITMENT_JUDGES_MAX} giám khảo.`),
  })
  .superRefine((values, context) => {
    const opens = parseVnDateTime(values.opensDate, values.opensTime)
    const closes = parseVnDateTime(values.closesDate, values.closesTime)
    if (DATE_TEXT.test(values.opensDate) && TIME_TEXT.test(values.opensTime) && !opens) context.addIssue({ code: 'custom', path: ['opensDate'], message: 'Thời điểm này không tồn tại.' })
    if (DATE_TEXT.test(values.closesDate) && TIME_TEXT.test(values.closesTime)) {
      if (!closes) context.addIssue({ code: 'custom', path: ['closesDate'], message: 'Thời điểm này không tồn tại.' })
      else if (opens && Date.parse(closes) <= Date.parse(opens)) context.addIssue({ code: 'custom', path: ['closesDate'], message: 'Giờ đóng phải sau giờ mở.' })
    }
    const departments = new Set<string>()
    values.quotas.forEach((row, index) => {
      if (!row.departmentId) context.addIssue({ code: 'custom', path: ['quotas', index, 'departmentId'], message: 'Chọn ban.' })
      else if (departments.has(row.departmentId)) context.addIssue({ code: 'custom', path: ['quotas', index, 'departmentId'], message: 'Ban này đã có ở dòng khác.' })
      departments.add(row.departmentId)
      const quota = Number(row.quota)
      if (!/^\d+$/.test(row.quota) || quota < RECRUITMENT_QUOTA_MIN || quota > RECRUITMENT_QUOTA_MAX) {
        context.addIssue({ code: 'custom', path: ['quotas', index, 'quota'], message: `Từ ${RECRUITMENT_QUOTA_MIN} đến ${RECRUITMENT_QUOTA_MAX}.` })
      }
    })
    const names = new Set<string>()
    values.rounds.forEach((round, index) => {
      const key = round.name.toLowerCase()
      if (round.name.length < RECRUITMENT_ROUND_NAME_MIN || round.name.length > RECRUITMENT_ROUND_NAME_MAX) {
        context.addIssue({ code: 'custom', path: ['rounds', index, 'name'], message: `Tên vòng cần từ ${RECRUITMENT_ROUND_NAME_MIN} đến ${RECRUITMENT_ROUND_NAME_MAX} ký tự.` })
      } else if (names.has(key)) context.addIssue({ code: 'custom', path: ['rounds', index, 'name'], message: 'Tên vòng bị trùng.' })
      names.add(key)
    })
    values.questions.forEach((question, index) => {
      if (question.text.length < RECRUITMENT_QUESTION_MIN || question.text.length > RECRUITMENT_QUESTION_MAX) {
        context.addIssue({ code: 'custom', path: ['questions', index, 'text'], message: `Câu hỏi cần từ ${RECRUITMENT_QUESTION_MIN} đến ${RECRUITMENT_QUESTION_MAX} ký tự.` })
      }
    })
  })

export type RecruitmentFormValues = z.infer<typeof recruitmentFormSchema>

export const EMPTY_ROUND = { id: null, name: '' }
export const EMPTY_QUESTION = { id: null, text: '', required: true }

export function toRecruitmentFormValues(detail: RecruitmentDetail | null): RecruitmentFormValues {
  if (!detail) {
    return {
      name: '',
      description: '',
      opensDate: '',
      opensTime: '08:00',
      closesDate: '',
      closesTime: '22:00',
      quotas: [{ departmentId: '', quota: '' }],
      rounds: [{ id: null, name: 'Lọc đơn' }],
      questions: [],
      judgeIds: [],
    }
  }
  return {
    name: detail.name,
    description: detail.description,
    opensDate: formatDate(detail.opensAt),
    opensTime: formatTime(detail.opensAt),
    closesDate: formatDate(detail.closesAt),
    closesTime: formatTime(detail.closesAt),
    quotas: detail.quotas.map((quota) => ({ departmentId: quota.departmentId, quota: String(quota.quota) })),
    rounds: detail.rounds.map((round) => ({ id: round.id, name: round.name })),
    questions: detail.questions.map((question) => ({ id: question.id, text: question.text, required: question.required })),
    judgeIds: detail.judges.map((judge) => judge.id),
  }
}

/** Chỉ gọi sau khi schema đã chấp nhận. */
export function toRecruitmentRequest(values: RecruitmentFormValues): RecruitmentRequest {
  return {
    name: values.name,
    description: values.description,
    opensAt: parseVnDateTime(values.opensDate, values.opensTime) ?? '',
    closesAt: parseVnDateTime(values.closesDate, values.closesTime) ?? '',
    quotas: values.quotas.map((row) => ({ departmentId: row.departmentId, quota: Number(row.quota) })),
    rounds: values.rounds.map((round) => ({ id: round.id, name: round.name })),
    questions: values.questions.map((question) => ({ id: question.id, text: question.text, required: question.required })),
    judgeIds: values.judgeIds,
  }
}

/** Đổi tên trường lỗi của máy chủ sang đường dẫn ô: `quotas[0].quota` → `quotas.0.quota`, `opensAt` → `opensDate`. */
export function recruitmentFieldPath(serverField: string): string {
  if (serverField === 'opensAt') return 'opensDate'
  if (serverField === 'closesAt') return 'closesDate'
  return serverField.replace(/\[(\d+)\]/g, '.$1')
}
