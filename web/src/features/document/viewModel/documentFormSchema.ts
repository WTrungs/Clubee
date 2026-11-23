import { z } from 'zod'
import { DOCUMENT_TAG_MAX_LENGTH, DOCUMENT_TAGS_MAX } from '@/shared/lib/documentRules'
import type { DocumentScopeOption, DocumentVisibility, UploadDocumentRequest } from '../model/documentTypes'

export { DOCUMENT_TAG_MAX_LENGTH, DOCUMENT_TAGS_MAX } from '@/shared/lib/documentRules'

/** Nhãn nhập cách nhau bằng dấu phẩy; bỏ khoảng trắng thừa và nhãn trùng. */
export const parseTags = (text: string) => [...new Set(text.split(',').map((tag) => tag.trim().replace(/\s+/g, ' ')).filter((tag) => tag !== ''))]

/** Khóa của một nơi sở hữu trong ô chọn: `CLUB`, hoặc `DEPARTMENT:mã`, `EVENT:mã`. */
export const scopeKeyOf = (scope: Pick<DocumentScopeOption, 'type' | 'id'>) => (scope.type === 'CLUB' ? 'CLUB' : `${scope.type}:${scope.id ?? ''}`)

export const documentFormSchema = z
  .object({
    file: z.instanceof(File, { message: 'Chọn tệp để tải lên.' }).nullable(),
    title: z.string().trim().min(3, 'Tên tài liệu cần ít nhất 3 ký tự.').max(150, 'Tên tối đa 150 ký tự.'),
    description: z.string().trim().max(1000, 'Mô tả tối đa 1000 ký tự.'),
    scopeKey: z.string().min(1, 'Chọn nơi sở hữu.'),
    termId: z.string(),
    tagsText: z.string(),
    visibility: z.enum(['CLUB', 'OWNER', 'BOARD']),
  })
  .superRefine((values, context) => {
    if (values.file === null) context.addIssue({ code: 'custom', path: ['file'], message: 'Chọn tệp để tải lên.' })
    const tags = parseTags(values.tagsText)
    if (tags.length > DOCUMENT_TAGS_MAX) context.addIssue({ code: 'custom', path: ['tagsText'], message: `Tối đa ${DOCUMENT_TAGS_MAX} nhãn.` })
    else if (tags.some((tag) => tag.length > DOCUMENT_TAG_MAX_LENGTH)) {
      context.addIssue({ code: 'custom', path: ['tagsText'], message: `Mỗi nhãn tối đa ${DOCUMENT_TAG_MAX_LENGTH} ký tự.` })
    }
  })

export type DocumentFormValues = z.infer<typeof documentFormSchema>

export const visibilityOptions: Array<{ value: DocumentVisibility; label: string; hint: string }> = [
  { value: 'CLUB', label: 'Toàn CLB', hint: 'Mọi thành viên CLB.' },
  { value: 'OWNER', label: 'Nơi sở hữu', hint: 'Thành viên ban hoặc BTC sự kiện sở hữu, cùng ban chủ nhiệm; tài liệu của CLB thì chỉ ban chủ nhiệm.' },
  { value: 'BOARD', label: 'Ban chủ nhiệm', hint: 'Chỉ ban chủ nhiệm.' },
]

export function toUploadRequest(values: DocumentFormValues): UploadDocumentRequest {
  const [type = 'CLUB', id] = values.scopeKey.split(':')
  return {
    file: values.file as File,
    title: values.title.trim(),
    description: values.description.trim(),
    ownerType: type as UploadDocumentRequest['ownerType'],
    ownerId: type === 'CLUB' ? null : (id ?? null),
    termId: values.termId || null,
    tags: parseTags(values.tagsText),
    visibility: values.visibility,
  }
}
