/** Còn bao nhiêu ngày tới hạn nộp thì nhắc người còn thiếu (FR-FIN-10). */
export const DUES_REMIND_DAYS = 3

/** Số còn phải nộp, không âm. */
export const remainingDue = (item: { amountDue: number; paidAmount: number }) => Math.max(item.amountDue - item.paidAmount, 0)
