import { MAX_UPLOAD_BYTES } from './validateUploadFile'

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

export const IMAGE_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png'

/** Kiểu nội dung của ảnh theo đuôi tệp; `null` nếu không phải JPG, PNG. */
export function imageContentType(fileName: string): string | null {
  return IMAGE_TYPES[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

/** Ảnh đại diện, logo: chỉ JPG, PNG (đuôi và kiểu khớp nhau), tối đa 15 MB (IF-05). Trả câu báo lỗi hoặc `null`. */
export function validateImageFile(file: Pick<File, 'name' | 'size' | 'type'>, subject: string): string | null {
  const expected = imageContentType(file.name)
  if (!expected || (file.type !== '' && file.type !== expected)) return `${subject} chỉ nhận tệp JPG hoặc PNG.`
  if (file.size === 0) return 'Tệp ảnh rỗng.'
  if (file.size > MAX_UPLOAD_BYTES) return 'Ảnh vượt quá 15 MB.'
  return null
}
