import { z } from 'zod'
import type { AnnouncementAudience, AnnouncementAudienceRef, SendAnnouncementRequest } from '../model/notificationTypes'

export const ANNOUNCEMENT_TITLE_MAX = 150
export const ANNOUNCEMENT_BODY_MAX = 2000

/** FR-NOT-01; `audience` là khóa `KIND:scopeId` của một nhóm trong danh sách máy chủ trả về. */
export const announcementSchema = z.object({
  audience: z.string().min(1, 'Chọn nhóm nhận thông báo.'),
  title: z.string().trim().min(3, 'Tiêu đề cần ít nhất 3 ký tự.').max(ANNOUNCEMENT_TITLE_MAX, `Tiêu đề tối đa ${ANNOUNCEMENT_TITLE_MAX} ký tự.`),
  body: z.string().trim().min(1, 'Nhập nội dung thông báo.').max(ANNOUNCEMENT_BODY_MAX, `Nội dung tối đa ${ANNOUNCEMENT_BODY_MAX} ký tự.`),
  sendEmail: z.boolean(),
})
export type AnnouncementValues = z.infer<typeof announcementSchema>

export const audienceKey = (audience: AnnouncementAudienceRef) => `${audience.kind}:${audience.scopeId}`

export function findAudience(audiences: AnnouncementAudience[], key: string): AnnouncementAudience | null {
  return audiences.find((audience) => audienceKey(audience) === key) ?? null
}

/** Trả null khi nhóm đã chọn không còn trong danh sách (ví dụ vừa mất chức vụ); form sẽ báo chọn lại. */
export function toSendAnnouncementRequest(values: AnnouncementValues, audiences: AnnouncementAudience[]): SendAnnouncementRequest | null {
  const audience = findAudience(audiences, values.audience)
  if (!audience) return null
  return {
    audience: { kind: audience.kind, scopeId: audience.scopeId },
    title: values.title.trim(),
    body: values.body.trim(),
    sendEmail: values.sendEmail,
  }
}
