import { http, HttpResponse } from 'msw'
import type { AnnouncementAudienceKind, AnnouncementReceipt, SendAnnouncementRequest, SendAnnouncementResult, SentAnnouncement } from '@/features/notification/model/notificationTypes'
import { db, type DbNotification } from '../db'
import { announcementAudiences, audienceRecipients } from '../mockAnnouncements'
import { API, currentUser, networkDelay, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, personRef } from '../mockMembers'
import { clubTarget, eventTarget, notify } from '../mockNotifications'
import { nowIso } from '../mockTime'

const AUDIENCE_KINDS: AnnouncementAudienceKind[] = ['CLUB', 'DEPARTMENT', 'EVENT_STAFF']
const TITLE_MAX = 150
const BODY_MAX = 2000

function memberClub(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canAccessClub(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  return null
}

/** FR-NOT-05: chỉ người gửi, khi còn là thành viên CLB, xem ai đã đọc và ghim thông báo của mình. */
function ownAnnouncement(userId: string, params: Record<string, string | readonly string[] | undefined>): { ok: true; notification: DbNotification } | { ok: false; response: Response } {
  const notification = db.notifications.find((candidate) => candidate.id === params.announcementId && candidate.clubId === params.clubId && candidate.kind === 'MANUAL')
  if (!notification) return { ok: false, response: problem(404, 'Không tìm thấy thông báo.', 'NOTIFICATION_NOT_FOUND') }
  if (notification.senderId !== userId || !canAccessClub(userId, String(params.clubId))) {
    return { ok: false, response: problem(403, 'Chỉ người gửi xem được ai đã đọc và ghim thông báo này.', 'FORBIDDEN') }
  }
  return { ok: true, notification }
}

function audienceLabelOf(notification: DbNotification): string {
  const audience = notification.audience
  if (!audience || audience.kind === 'CLUB') return 'Toàn CLB'
  if (audience.kind === 'DEPARTMENT') return `Ban ${db.departments.find((department) => department.id === audience.scopeId)?.name ?? ''}`
  return `BTC ${db.events.find((event) => event.id === audience.scopeId)?.name ?? ''}`
}

function toSentAnnouncement(notification: DbNotification): SentAnnouncement {
  const recipients = db.notificationRecipients.filter((recipient) => recipient.notificationId === notification.id)
  return {
    id: notification.id,
    clubId: notification.clubId ?? '',
    clubName: db.clubs.find((club) => club.id === notification.clubId)?.name ?? '',
    title: notification.title,
    audienceLabel: audienceLabelOf(notification),
    createdAt: notification.createdAt,
    recipientCount: recipients.length,
    readCount: recipients.filter((recipient) => recipient.readAt !== null).length,
    pinned: Boolean(notification.pinned),
    allowedActions: [notification.pinned ? 'UNPIN' : 'PIN'],
  }
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
      audience: { kind: audience.kind, scopeId: audience.scopeId },
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

  http.get(`${API}/me/sent-announcements`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const rows = db.notifications
      .filter((notification) => notification.kind === 'MANUAL' && notification.senderId === user.value.id && notification.clubId !== null && canAccessClub(user.value.id, notification.clubId))
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toSentAnnouncement)
    return HttpResponse.json(paginate(rows, new URL(request.url), 20))
  }),

  http.get(`${API}/clubs/:clubId/announcements/:announcementId/receipts`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = ownAnnouncement(user.value.id, params)
    if (!target.ok) return target.response
    const url = new URL(request.url)
    const read = url.searchParams.get('read')
    const rows: AnnouncementReceipt[] = db.notificationRecipients
      .filter((recipient) => recipient.notificationId === target.notification.id)
      .filter((recipient) => read === null || (read === 'true') === (recipient.readAt !== null))
      .map((recipient) => ({ person: personRef(recipient.userId), readAt: recipient.readAt }))
      .toSorted((a, b) => (b.readAt ?? '').localeCompare(a.readAt ?? '') || a.person.fullName.localeCompare(b.person.fullName, 'vi'))
    return HttpResponse.json(paginate(rows, url, 50))
  }),

  http.put(`${API}/clubs/:clubId/announcements/:announcementId/pin`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = ownAnnouncement(user.value.id, params)
    if (!target.ok) return target.response
    const body = (await request.json()) as { pinned?: unknown }
    if (typeof body.pinned !== 'boolean') return problem(400, 'Chọn ghim hoặc bỏ ghim.', 'VALIDATION', [{ field: 'pinned', message: 'Chọn ghim hoặc bỏ ghim.' }])
    target.notification.pinned = body.pinned ? { by: user.value.id, at: nowIso() } : null
    return HttpResponse.json(toSentAnnouncement(target.notification))
  }),
]
