/** IF-05: chỉ nhận JPG, PNG, PDF, DOCX, XLSX, PPTX; tối đa 15 MB mỗi tệp. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const ALLOWED_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const UPLOAD_ACCEPT = [...new Set(Object.values(ALLOWED_TYPES)), '.jpg', '.jpeg', '.png', '.pdf', '.docx', '.xlsx', '.pptx'].join(',')

export const UPLOAD_HINT = 'JPG, PNG, PDF, DOCX, XLSX, PPTX; tối đa 15 MB mỗi tệp'

export type UploadValidationResult = { ok: true } | { ok: false; message: string }

export function validateUploadFile(file: Pick<File, 'name' | 'size' | 'type'>): UploadValidationResult {
  const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
  const expectedType = ALLOWED_TYPES[extension]
  // Browsers may report an empty type; then the extension decides. A conflicting type is rejected.
  if (!expectedType || (file.type !== '' && file.type !== expectedType)) {
    return { ok: false, message: `Tệp "${file.name}" không đúng định dạng. Chỉ nhận ${UPLOAD_HINT.split(';')[0]}.` }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `Tệp "${file.name}" vượt quá 15 MB.` }
  }
  if (file.size === 0) {
    return { ok: false, message: `Tệp "${file.name}" rỗng.` }
  }
  return { ok: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
