/** Tỷ lệ chuyên cần dạng phần trăm làm tròn; chưa có bản ghi nào tính được thì nói rõ. */
export const rateLabel = (rate: number | null) => (rate === null ? 'Chưa có số liệu' : `${Math.round(rate * 100)}%`)
