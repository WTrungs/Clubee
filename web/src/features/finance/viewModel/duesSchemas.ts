import { z } from 'zod'
import { parseVnDate } from '@/shared/format/formatDate'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { dateText } from './advanceSchemas'
import { amountText, DATE_TEXT } from './financeSchemas'

export const DUES_NAME_MIN = 3
export const DUES_NAME_MAX = 100

const nameText = z.string().trim().min(DUES_NAME_MIN, `Tên kỳ cần ít nhất ${DUES_NAME_MIN} ký tự.`).max(DUES_NAME_MAX, `Tên kỳ tối đa ${DUES_NAME_MAX} ký tự.`)
const reasonText = z.string().trim().min(REASON_MIN, `Lý do cần ít nhất ${REASON_MIN} ký tự.`).max(REASON_MAX, `Lý do tối đa ${REASON_MAX} ký tự.`)

/** Mức sau giảm phải từ 1 tới dưới mức đóng; mức đóng chưa hợp lệ thì để ô mức đóng báo lỗi. */
function checkReduced(amount: string, full: number | null, context: z.RefinementCtx, path: Array<string | number>) {
  const value = parseMoney(amount)
  if (value === null || value <= 0 || (full !== null && value >= full)) {
    context.addIssue({ code: 'custom', path, message: full !== null ? `Mức sau giảm từ 1 đ tới dưới ${formatMoney(full)}.` : 'Nhập mức sau giảm.' })
  }
}

const exemptionRow = z.object({
  userId: z.string(),
  fullName: z.string(),
  kind: z.enum(['EXEMPT', 'REDUCED']),
  amount: z.string(),
  reason: reasonText,
})

/** FR-FIN-09: mở đợt; hạn nộp từ hôm nay (`today` yyyy-mm-dd); mỗi người miễn giảm cần lý do. */
export function openDuesSchema(today: string) {
  return z
    .object({
      name: nameText,
      amount: amountText,
      dueDate: dateText(today, null, 'Hạn nộp từ hôm nay trở đi.'),
      exemptions: z.array(exemptionRow),
    })
    .superRefine((values, context) => {
      const full = parseMoney(values.amount)
      values.exemptions.forEach((row, index) => {
        if (row.kind === 'REDUCED') checkReduced(row.amount, full, context, ['exemptions', index, 'amount'])
      })
    })
}

export type OpenDuesValues = z.infer<ReturnType<typeof openDuesSchema>>
export type ExemptionRowValues = OpenDuesValues['exemptions'][number]

/**
 * Sửa đợt đang mở: tên, hạn; mức chỉ gửi khi được sửa. Hạn chỉ phải từ hôm nay khi đổi sang ngày khác `currentDueOn`, để đợt
 * đã quá hạn vẫn sửa được tên mà không phải dời hạn.
 */
export function editDuesSchema(today: string, currentDueOn: string | null) {
  return z.object({
    name: nameText,
    dueDate: z
      .string()
      .trim()
      .superRefine((text, context) => {
        const date = DATE_TEXT.test(text) ? parseVnDate(text) : null
        if (date === null) context.addIssue({ code: 'custom', message: 'Nhập ngày dạng dd/mm/yyyy.' })
        else if (date !== currentDueOn && date < today) context.addIssue({ code: 'custom', message: 'Hạn nộp mới từ hôm nay trở đi.' })
      }),
    amount: amountText,
  })
}

export type EditDuesValues = z.infer<ReturnType<typeof editDuesSchema>>

/** Miễn giảm cho một người sau khi mở: `NONE` bỏ miễn giảm, không cần lý do. */
export function exemptionSchema(fullAmount: number) {
  return z
    .object({ kind: z.enum(['EXEMPT', 'REDUCED', 'NONE']), amount: z.string(), reason: z.string() })
    .superRefine((values, context) => {
      if (values.kind === 'NONE') return
      const reason = reasonText.safeParse(values.reason)
      if (!reason.success) context.addIssue({ code: 'custom', path: ['reason'], message: reason.error.issues[0]?.message ?? 'Nhập lý do.' })
      if (values.kind === 'REDUCED') checkReduced(values.amount, fullAmount, context, ['amount'])
    })
}

export type ExemptionValues = z.infer<ReturnType<typeof exemptionSchema>>
