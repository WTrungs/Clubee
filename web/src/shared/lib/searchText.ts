/** Bỏ dấu tiếng Việt và viết thường để tìm kiếm không phân biệt dấu ("ha" khớp "Hà"). */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

export function matchesKeyword(text: string, keyword: string | null | undefined): boolean {
  if (!keyword || !keyword.trim()) return true
  return normalizeForSearch(text).includes(normalizeForSearch(keyword))
}
