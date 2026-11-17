const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

/** Số tiền VND có dấu phân cách hàng nghìn, ví dụ "1.500.000 đ" (NFR-USA-03). */
export function formatMoney(amount: number): string {
  return `${numberFormatter.format(amount)} đ`
}

/** Số nguyên có dấu phân cách hàng nghìn, không kèm đơn vị. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/** Bỏ phần lẻ của số dán vào: sau dấu phẩy, hoặc sau dấu chấm duy nhất đứng sau từ 4 chữ số ("1500000.00"); chuỗi đang gõ luôn đúng nhóm. */
function dropFraction(text: string): string {
  const [integer = ''] = text.split(',')
  return /^\s*(\d{4,})\.\d{1,2}\s*$/.exec(integer)?.[1] ?? integer
}

/** Giữ lại chữ số khi gõ vào ô tiền và chèn dấu chấm hàng nghìn, ví dụ "1500000" thành "1.500.000". */
export function formatMoneyInput(text: string): string {
  const digits = dropFraction(text).replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13)
  return digits === '' ? '' : formatNumber(Number(digits))
}

/** Ô tiền thành số đồng; chỉ nhận số liền hoặc dấu chấm đúng nhóm ba chữ số ("1.500.000"), còn lại trả null. */
export function parseMoney(text: string): number | null {
  const compact = text.trim().replace(/\s/g, '')
  if (!/^\d+$/.test(compact) && !/^\d{1,3}(\.\d{3})+$/.test(compact)) return null
  const value = Number(compact.replace(/\./g, ''))
  return Number.isSafeInteger(value) ? value : null
}
