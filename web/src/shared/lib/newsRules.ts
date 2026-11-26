/** Độ dài tin tức CLB (FR-CLB-06), dùng chung cho form và mock. */
export const NEWS_TITLE_MIN = 5
export const NEWS_TITLE_MAX = 150
export const NEWS_BODY_MIN = 20
export const NEWS_BODY_MAX = 10000
export const NEWS_EXCERPT_MAX = 160

/** Trích đoạn đầu nội dung trên một dòng, cắt ở ranh giới từ. */
export function newsExcerpt(body: string, max = NEWS_EXCERPT_MAX): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}
