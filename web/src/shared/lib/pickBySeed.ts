/** Chọn ổn định một phần tử theo chuỗi (cùng mã luôn ra cùng màu), dùng cho avatar, ký hiệu CLB, ảnh bìa. */
export function pickBySeed<T>(seed: string, items: readonly [T, ...T[]]): T {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return items[hash % items.length] ?? items[0]
}
