import { z } from 'zod'
import { parseVnDate } from '@/shared/format/formatDate'
import { EXPENSE_CATEGORIES } from '../model/financeTypes'
import { amountText, DATE_TEXT } from './financeSchemas'

export const ADVANCE_PURPOSE_MIN = 5
export const ADVANCE_PURPOSE_MAX = 500
/** Hạn quyết toán xa nhất tính từ hôm nay, khớp với máy chủ. */
export const ADVANCE_SETTLE_MAX_DAYS = 90

/** Ngày dd/mm/yyyy nằm trong [from, to] (yyyy-mm-dd); `to` null là không chặn trên. */
function dateText(from: string | null, to: string | null, message: string) {
  return z
    .string()
    .trim()
    .superRefine((text, context) => {
      if (!DATE_TEXT.test(text)) {
        context.addIssue({ code: 'custom', message: 'Nhập ngày dạng dd/mm/yyyy.' })
        return
      }
      const date = parseVnDate(text)
      if (date === null || (from !== null && date < from) || (to !== null && date > to)) context.addIssue({ code: 'custom', message })
    })
}

/** FR-FIN-07: `today`, `latest` dạng yyyy-mm-dd; hạn quyết toán từ hôm nay tới `latest` (hôm nay cộng 90 ngày). */
export function proposeAdvanceSchema(today: string, latest: string) {
  return z.object({
    amount: amountText,
    category: z.enum(EXPENSE_CATEGORIES, { message: 'Chọn hạng mục chi.' }),
    purpose: z
      .string()
      .trim()
      .min(ADVANCE_PURPOSE_MIN, `Mục đích cần ít nhất ${ADVANCE_PURPOSE_MIN} ký tự.`)
      .max(ADVANCE_PURPOSE_MAX, `Mục đích tối đa ${ADVANCE_PURPOSE_MAX} ký tự.`),
    settleDate: dateText(today, latest, `Hạn quyết toán từ hôm nay đến tối đa ${ADVANCE_SETTLE_MAX_DAYS} ngày tới.`),
  })
}

export type ProposeAdvanceValues = z.infer<ReturnType<typeof proposeAdvanceSchema>>

/** Ngày ứng không sau hôm nay. */
export function disburseSchema(today: string) {
  return z.object({ disbursedDate: dateText(null, today, 'Ngày ứng không được sau hôm nay.') })
}

export type DisburseValues = z.infer<ReturnType<typeof disburseSchema>>
