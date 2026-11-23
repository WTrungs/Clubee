/** Mở hộp lưu tệp của trình duyệt cho một blob đã tải (FR-DOC-02). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Giữ URL tới khi trình duyệt bắt đầu tải rồi mới thu hồi.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
