import { http, HttpResponse } from 'msw'
import type { NotificationCategory, NotificationDetail, NotificationSummary } from '@/features/notification/model/notificationTypes'
import { db, type DbNotification, type DbNotificationRecipient } from '../db'
import { API, currentUser, matchesKeyword, networkDelay, paginate, problem, writer } from '../mockHttp'
import { canViewTransaction } from '../mockFinance'
import { canAccessClub, personRef } from '../mockMembers'
import { nowIso } from '../mockTime'

const CATEGORIES: NotificationCategory[] = ['MEMBERSHIP', 'POSITION', 'TASK', 'EVENT', 'SESSION', 'FINANCE', 'TERM', 'ANNOUNCEMENT']

const clubNameOf = (clubId: string | null) => (clubId ? (db.clubs.find((club) => club.id === clubId)?.name ?? null) : null)

function toSummary(notification: DbNotification, recipient: DbNotificationRecipient): NotificationSummary {
  return {
    id: notification.id,
    kind: notification.kind,
    category: notification.category,
    title: notification.title,
    clubId: notification.clubId,
    clubName: clubNameOf(notification.clubId),
    createdAt: notification.createdAt,
    readAt: recipient.readAt,
    target: notification.target,
  }
}

function inboxOf(userId: string): Array<{ notification: DbNotification; recipient: DbNotificationRecipient }> {
  // Thời điểm chỉ chính xác tới giây nên khi trùng, bản ghi sau xếp trước.
  const order = (notification: DbNotification) => db.notifications.indexOf(notification)
  return db.notificationRecipients
    .filter((recipient) => recipient.userId === userId)
    .flatMap((recipient) => {
      const notification = db.notifications.find((candidate) => candidate.id === recipient.notificationId)
      return notification ? [{ notification, recipient }] : []
    })
    .toSorted((a, b) => b.notification.createdAt.localeCompare(a.notification.createdAt) || order(b.notification) - order(a.notification))
}

/** Thông báo chỉ người nhận thấy; người khác nhận 404 như không tồn tại. */
function findOwn(userId: string, notificationId: string) {
  return inboxOf(userId).find((entry) => entry.notification.id === notificationId)
}

const notFound = () => problem(404, 'Không tìm thấy thông báo.', 'NOTIFICATION_NOT_FOUND')

export const notificationHandlers = [
  http.get(`${API}/me/notifications`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    if (category && !CATEGORIES.includes(category as NotificationCategory)) return problem(400, 'Loại thông báo không hợp lệ.', 'VALIDATION')
    const unreadOnly = url.searchParams.get('unread') === 'true'
    const keyword = url.searchParams.get('q')
    const rows = inboxOf(user.value.id)
      .filter(({ notification }) => !category || notification.category === category)
      .filter(({ recipient }) => !unreadOnly || recipient.readAt === null)
      .filter(({ notification }) => matchesKeyword(`${notification.title} ${clubNameOf(notification.clubId) ?? ''}`, keyword))
      .map(({ notification, recipient }) => toSummary(notification, recipient))
    return HttpResponse.json(paginate(rows, url))
  }),

  http.get(`${API}/me/notifications/unread-count`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    return HttpResponse.json({ count: inboxOf(user.value.id).filter(({ recipient }) => recipient.readAt === null).length })
  }),

  http.get(`${API}/me/notifications/:notificationId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const entry = findOwn(user.value.id, String(params.notificationId))
    if (!entry) return notFound()
    const { notification, recipient } = entry
    // BR-SEC-02: nội dung thông báo của CLB chỉ mở được khi người nhận còn là thành viên tại thời điểm mở.
    if (notification.kind === 'MANUAL' && notification.clubId && !canAccessClub(user.value.id, notification.clubId)) {
      return problem(403, `Bạn không còn là thành viên ${clubNameOf(notification.clubId) ?? 'CLB này'} nên không xem được nội dung thông báo.`, 'NOT_A_MEMBER')
    }
    // Nội dung thông báo tài chính nêu số tiền, quỹ, người đề xuất: chỉ mở khi còn xem được giao dịch đó.
    const transaction = notification.target?.type === 'FINANCE' ? db.transactions.find((candidate) => candidate.id === notification.target?.id) : undefined
    if (transaction && !canViewTransaction(user.value.id, transaction)) {
      return problem(403, 'Bạn không còn quyền xem khoản thu chi này nên không xem được nội dung thông báo.', 'FORBIDDEN')
    }
    const detail: NotificationDetail = {
      ...toSummary(notification, recipient),
      body: notification.body,
      sender: notification.senderId ? personRef(notification.senderId) : null,
    }
    return HttpResponse.json(detail)
  }),

  http.post(`${API}/me/notifications/read-all`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const now = nowIso()
    for (const { recipient } of inboxOf(user.value.id)) recipient.readAt ??= now
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/me/notifications/:notificationId/read`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const entry = findOwn(user.value.id, String(params.notificationId))
    if (!entry) return notFound()
    entry.recipient.readAt ??= nowIso()
    return HttpResponse.json(toSummary(entry.notification, entry.recipient))
  }),
]
