/** Thứ tự đến của danh sách chờ (BR-EVT-03): theo thời điểm đăng ký; trùng thời điểm thì bản ghi được lưu trước đứng trước. */
export function byArrival<T extends { registeredAt: string }>(rows: readonly T[], store: readonly T[]): T[] {
  return rows.toSorted((a, b) => Date.parse(a.registeredAt) - Date.parse(b.registeredAt) || store.indexOf(a) - store.indexOf(b))
}
