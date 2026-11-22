import { z } from 'zod'
import { STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'
import { APPLICATION_ANSWER_MAX, APPLICATION_CHOICES_MAX } from '@/shared/lib/recruitmentRules'
import type { PublicRecruitment, SubmitApplicationRequest } from '../model/recruitmentTypes'

/** FR-REC-02: nguyện vọng 1 bắt buộc, 2 và 3 tùy chọn, không trùng ban; câu bắt buộc phải trả lời; MSSV khi CLB thu thập. */
export function applicationFormSchema(recruitment: Pick<PublicRecruitment, 'questions' | 'collectsStudentId'>) {
  return z
    .object({
      choices: z.array(z.string()).length(APPLICATION_CHOICES_MAX),
      answers: z.array(z.string().trim().max(APPLICATION_ANSWER_MAX, `Tối đa ${APPLICATION_ANSWER_MAX} ký tự.`)),
      studentId: z.string().trim(),
    })
    .superRefine((values, context) => {
      if (!values.choices[0]) context.addIssue({ code: 'custom', path: ['choices', 0], message: 'Chọn nguyện vọng 1.' })
      const seen = new Set<string>()
      values.choices.forEach((choice, index) => {
        if (!choice) return
        if (seen.has(choice)) context.addIssue({ code: 'custom', path: ['choices', index], message: 'Ban này đã chọn ở nguyện vọng trước.' })
        seen.add(choice)
      })
      // Bỏ trống nguyện vọng 2 mà chọn 3 thì thứ tự nguyện vọng không còn rõ.
      if (!values.choices[1] && values.choices[2]) context.addIssue({ code: 'custom', path: ['choices', 2], message: 'Chọn nguyện vọng 2 trước.' })
      recruitment.questions.forEach((question, index) => {
        if (question.required && !values.answers[index]?.trim()) context.addIssue({ code: 'custom', path: ['answers', index], message: 'Câu này bắt buộc trả lời.' })
      })
      if (recruitment.collectsStudentId && !STUDENT_ID_PATTERN.test(values.studentId)) context.addIssue({ code: 'custom', path: ['studentId'], message: STUDENT_ID_MESSAGE })
    })
}

export type ApplicationFormValues = z.infer<ReturnType<typeof applicationFormSchema>>

export function emptyApplication(recruitment: Pick<PublicRecruitment, 'questions'>): ApplicationFormValues {
  return { choices: Array.from({ length: APPLICATION_CHOICES_MAX }, () => ''), answers: recruitment.questions.map(() => ''), studentId: '' }
}

export function toSubmitRequest(recruitment: Pick<PublicRecruitment, 'questions' | 'collectsStudentId'>, values: ApplicationFormValues): SubmitApplicationRequest {
  return {
    choices: values.choices.filter((choice) => choice !== ''),
    answers: recruitment.questions.map((question, index) => ({ questionId: question.id, text: values.answers[index]?.trim() ?? '' })),
    studentId: recruitment.collectsStudentId ? values.studentId.trim() : null,
  }
}

/** `answers[2].text` → `answers.2`, `choices` → `choices.0`. */
export function applicationFieldPath(serverField: string): string {
  if (serverField === 'choices') return 'choices.0'
  const answer = /^answers\[(\d+)\]\.text$/.exec(serverField)
  return answer ? `answers.${answer[1]}` : serverField
}
