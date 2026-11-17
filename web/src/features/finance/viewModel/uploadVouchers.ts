import { financeRepository } from '../model/financeRepository'

/** Tải các tệp chưa tải; tệp đã tải ở lần gửi trước (bị lỗi) thì dùng lại mã cũ để không tạo tệp thừa. */
export async function uploadVouchers(clubId: string, files: File[], uploaded: Map<File, string>): Promise<string[]> {
  const ids: string[] = []
  for (const file of files) {
    const known = uploaded.get(file)
    if (known) {
      ids.push(known)
      continue
    }
    const ref = await financeRepository.uploadAttachment(clubId, file)
    uploaded.set(file, ref.id)
    ids.push(ref.id)
  }
  return ids
}
