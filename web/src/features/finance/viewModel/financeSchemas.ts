import { z } from 'zod'
import { parseVnDate } from '@/shared/format/formatDate'
import { parseMoney } from '@/shared/format/formatMoney'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../model/financeTypes'

/** Trần số tiền một giao dịch, khớp với máy chủ. */
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000

export const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4}$/

/** Số nguyên dương, đơn vị VND (BR-FIN-04); mỗi ô chỉ báo một lỗi. */
export const amountText = z
  .string()
  .trim()
  .superRefine((text, context) => {
    if (text === '') {
      context.addIssue({ code: 'custom', message: 'Nhập số tiền.' })
      return
    }
    const amount = parseMoney(text)
    if (amount === null || amount <= 0 || amount > MAX_TRANSACTION_AMOUNT) {
      context.addIssue({ code: 'custom', message: 'Số tiền là số nguyên dương, tối đa 1.000.000.000 đ.' })
    }
  })

const descriptionText = z.string().trim().min(3, 'Nội dung cần ít nhất 3 ký tự.').max(200, 'Nội dung tối đa 200 ký tự.')

/** FR-FIN-01: ngày thu không sau hôm nay (`today` dạng yyyy-mm-dd). */
export function recordIncomeSchema(today: string) {
  return z.object({
    amount: amountText,
    occurredDate: z
      .string()
      .trim()
      .superRefine((text, context) => {
        if (!DATE_TEXT.test(text)) {
          context.addIssue({ code: 'custom', message: 'Nhập ngày dạng dd/mm/yyyy.' })
          return
        }
        const date = parseVnDate(text)
        if (date === null || date > today) context.addIssue({ code: 'custom', message: 'Ngày thu không hợp lệ hoặc sau hôm nay.' })
      }),
    category: z.enum(INCOME_CATEGORIES, { message: 'Chọn hạng mục thu.' }),
    description: descriptionText,
  })
}

export type RecordIncomeValues = z.infer<ReturnType<typeof recordIncomeSchema>>

/** FR-FIN-02: số tiền, hạng mục chi, nội dung; chứng từ nằm ngoài form nên kiểm riêng bằng `missingReceipt`. */
export const proposeExpenseSchema = z.object({
  amount: amountText,
  category: z.enum(EXPENSE_CATEGORIES, { message: 'Chọn hạng mục chi.' }),
  description: descriptionText,
})

export type ProposeExpenseValues = z.infer<typeof proposeExpenseSchema>

/** FR-FIN-05: chiều điều chỉnh, số tiền và lý do bắt buộc (BR-FIN-01). */
export const adjustmentSchema = z.object({
  direction: z.enum(['IN', 'OUT'], { message: 'Chọn tăng hay giảm quỹ.' }),
  amount: amountText,
  reason: z.string().trim().min(5, 'Lý do cần ít nhất 5 ký tự.').max(200, 'Lý do tối đa 200 ký tự.'),
})

export type AdjustmentValues = z.infer<typeof adjustmentSchema>

/** BR-FIN-03: khoản chi trên ngưỡng (không tính bằng ngưỡng) mà chưa đính kèm chứng từ. */
export function missingReceipt(amountText: string, threshold: number, fileCount: number): boolean {
  const amount = parseMoney(amountText)
  return amount !== null && amount > threshold && fileCount === 0
}
