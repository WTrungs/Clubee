import { http, HttpResponse } from 'msw'
import type { AnnouncementAudienceKind, SendAnnouncementRequest, SendAnnouncementResult } from '@/features/notification/model/notificationTypes'
import { db } from '../db'
import { announcementAudiences, audienceRecipients } from '../mockAnnouncements'
import { API, currentUser, networkDelay, problem, writer } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { clubTarget, eventTarget, notify } from '../mockNotifications'

const AUDIENCE_KINDS: AnnouncementAudienceKind[] = ['CLUB', 'DEPARTMENT', 'EVENT_STAFF']
const TITLE_MAX = 150
const BODY_MAX = 2000

function memberClub(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canAccessClub(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  return null
}

function announcementErrors(body: Partial<SendAnnouncementRequest>) {
  const title = (body.title ?? '').trim()
  const text = (body.body ?? '').trim()
  return {
    title,
    text,
    errors: [
      ...(title.length < 3 || title.length > TITLE_MAX ? [{ field: 'title', message: `Tiêu đề cần từ 3 đến ${TITLE_MAX} ký tự.` }] : []),
      ...(text.length < 1 || text.length > BODY_MAX ? [{ field: 'body', message: `Nội dung cần từ 1 đến ${BODY_MAX} ký tự.` }] : []),
    ],
  }
}

export const announcementHandlers = [
  http.get(`${API}/clubs/:clubId/announcement-audiences`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const refused = memberClub(user.value.id, clubId)
    if (refused) return refused
    return HttpResponse.json(announcementAudiences(user.value.id, clubId))
  }),

  http.post(`${API}/clubs/:clubId/announcements`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const refused = memberClub(user.value.id, clubId)
    if (refused) return refused
    const body = (await request.json()) as Partial<SendAnnouncementRequest>
    const audience = body.audience
    if (!audience || !AUDIENCE_KINDS.includes(audience.kind) || typeof audience.scopeId !== 'string') {
      return problem(400, 'Chọn nhóm nhận thông báo.', 'VALIDATION', [{ field: 'audience', message: 'Chọn nhóm nhận thông báo.' }])
    }
    // Kiểm tra phạm vi chức vụ trước nội dung để không tiết lộ gì về nhóm mình không được gửi.
    const recipients = audienceRecipients(user.value.id, clubId, audience)
    if (recipients === null) {
      return problem(403, 'Bạn chỉ gửi được thông báo cho nhóm thuộc phạm vi chức vụ của mình: Ban chủ nhiệm gửi toàn CLB, Trưởng ban, Phó ban gửi ban mình, Trưởng BTC gửi ban tổ chức.', 'FORBIDDEN')
    }
    const { title, text, errors } = announcementErrors(body)
    if (errors.length > 0) return problem(400, 'Thông báo chưa hợp lệ.', 'VALIDATION', errors)
    const notification = notify(recipients, {
      clubId,
      kind: 'MANUAL',
      category: 'ANNOUNCEMENT',
      title,
      body: text,
      sendEmail: body.sendEmail === true,
      target: audience.kind === 'EVENT_STAFF' ? eventTarget(clubId, audience.scopeId) : clubTarget(clubId),
      actorId: user.value.id,
    })
    if (!notification) return problem(422, 'Nhóm nhận chưa có ai ngoài bạn.', 'NO_RECIPIENTS')
    const result: SendAnnouncementResult = {
      id: notification.id,
      recipientCount: db.notificationRecipients.filter((recipient) => recipient.notificationId === notification.id).length,
    }
    return HttpResponse.json(result, { status: 201 })
  }),
]
