import { http, HttpResponse } from 'msw'
import type { CreateInvitationRequest, InvitationStatus } from '@/features/member/model/invitationTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { isEmail } from '@/shared/lib/contactRules'
import { db, type DbInvitation } from '../db'
import { can, forbidden } from '../mockAccess'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { invitationIsFor, invitationStatus, newInvitationToken, normalizeEmail, toInvitation, toInvitationPreview } from '../mockInvitations'
import { canAccessClub, membershipOf, personRef } from '../mockMembers'
import { notify } from '../mockNotifications'
import { addDays, nowIso } from '../mockTime'

const STATUSES: InvitationStatus[] = ['ACTIVE', 'EXPIRED', 'REVOKED', 'USED']
const EMAIL_MAX = 254

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const clubOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)

/** Người gọi là thành viên CLB và có quyền quản lý thành viên theo ma trận (FR-MEM-01). */
function managedClub(userId: string, clubId: string, what: string) {
  const club = clubOf(clubId)
  if (!club) return { ok: false as const, response: problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND') }
  if (!canAccessClub(userId, clubId)) return { ok: false as const, response: notMember() }
  if (!can(userId, clubId, 'MANAGE_MEMBERS')) return { ok: false as const, response: forbidden(clubId, 'MANAGE_MEMBERS', what) }
  return { ok: true as const, club }
}

export const invitationHandlers = [
  http.get(`${API}/clubs/:clubId/invitations`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = managedClub(user.value.id, String(params.clubId), 'xem lời mời gia nhập')
    if (!target.ok) return target.response
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    if (status !== null && !STATUSES.includes(status as InvitationStatus)) {
      return problem(400, 'Trạng thái lọc không hợp lệ.', 'VALIDATION', [{ field: 'status', message: 'Trạng thái lọc không hợp lệ.' }])
    }
    const rows = db.invitations
      .filter((invitation) => invitation.clubId === target.club.id && (status === null || invitationStatus(invitation) === status))
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map((invitation) => toInvitation(invitation, user.value.id)) })
  }),

  http.post(`${API}/clubs/:clubId/invitations`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = managedClub(user.value.id, String(params.clubId), 'mời thành viên')
    if (!target.ok) return target.response
    const club = target.club
    const body = (await request.json()) as Partial<CreateInvitationRequest>
    if (body.kind !== 'LINK' && body.kind !== 'EMAIL') {
      return problem(400, 'Chọn tạo liên kết hoặc mời qua email.', 'VALIDATION', [{ field: 'kind', message: 'Chọn tạo liên kết hoặc mời qua email.' }])
    }
    let email: string | null = null
    if (body.kind === 'EMAIL') {
      email = normalizeEmail(typeof body.email === 'string' ? body.email : '')
      if (email.length > EMAIL_MAX || !isEmail(email)) {
        return problem(400, 'Email người được mời chưa hợp lệ.', 'VALIDATION', [{ field: 'email', message: 'Email không hợp lệ.' }])
      }
      const invitee = db.users.find((candidate) => normalizeEmail(candidate.email) === email)
      const current = invitee ? membershipOf(invitee.id, club.id) : undefined
      if (current) {
        const state = current.status === 'PENDING' ? 'đang có yêu cầu gia nhập chờ duyệt' : 'đã là thành viên'
        return problem(409, `Người dùng có email này ${state} ở CLB.`, 'ALREADY_MEMBER', [{ field: 'email', message: `Người này ${state}.` }])
      }
      const existing = db.invitations.find((invitation) => invitation.clubId === club.id && invitation.email === email && invitationStatus(invitation) === 'ACTIVE')
      if (existing) {
        return problem(409, 'Email này đã có lời mời còn hiệu lực. Thu hồi lời mời cũ nếu muốn gửi lại.', 'INVITATION_EXISTS', [
          { field: 'email', message: 'Email này đã có lời mời còn hiệu lực.' },
        ])
      }
    }
    const createdAt = nowIso()
    // Hạn theo tham số CLB lúc tạo; đổi tham số sau này không đổi hạn của lời mời này (FR-CLB-03).
    const invitation: DbInvitation = {
      id: newId('inv'),
      clubId: club.id,
      kind: body.kind,
      token: newInvitationToken(),
      email,
      createdBy: user.value.id,
      createdAt,
      expiresAt: addDays(createdAt, club.inviteLinkDays),
      revokedAt: null,
      revokedBy: null,
      useCount: 0,
      version: 1,
    }
    db.invitations.push(invitation)
    // Mock không gửi thư (IF-03 thuộc máy chủ); email trùng tài khoản đã có thì báo trong app.
    const invitee = email ? db.users.find((candidate) => normalizeEmail(candidate.email) === email) : undefined
    if (invitee) {
      notify([invitee.id], {
        clubId: club.id,
        category: 'MEMBERSHIP',
        title: `Bạn được mời gia nhập ${club.name}`,
        body: `${personRef(user.value.id).fullName} mời bạn gia nhập. Lời mời còn hiệu lực đến ${formatDateTime(invitation.expiresAt)}.`,
        target: { type: 'INVITATION', clubId: club.id, id: invitation.token },
        actorId: user.value.id,
      })
    }
    return HttpResponse.json(toInvitation(invitation, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/invitations/:invitationId/revocation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = managedClub(user.value.id, String(params.clubId), 'thu hồi lời mời')
    if (!target.ok) return target.response
    const invitation = db.invitations.find((candidate) => candidate.id === String(params.invitationId) && candidate.clubId === target.club.id)
    if (!invitation) return problem(404, 'Không tìm thấy lời mời.', 'INVITATION_NOT_FOUND')
    const body = (await request.json()) as { version?: unknown }
    if (body.version !== invitation.version) {
      return problem(409, 'Lời mời vừa được người khác thay đổi. Tải lại danh sách rồi thử lại.', 'VERSION_CONFLICT')
    }
    if (invitationStatus(invitation) !== 'ACTIVE') {
      return problem(422, 'Lời mời đã hết hiệu lực nên không cần thu hồi.', 'INVITATION_NOT_ACTIVE')
    }
    Object.assign(invitation, { revokedAt: nowIso(), revokedBy: user.value.id, version: invitation.version + 1 })
    return HttpResponse.json(toInvitation(invitation, user.value.id))
  }),

  http.get(`${API}/invitations/:token`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const invitation = db.invitations.find((candidate) => candidate.token === String(params.token))
    const club = invitation ? clubOf(invitation.clubId) : undefined
    if (!invitation || !club) return problem(404, 'Liên kết mời không đúng. Kiểm tra lại đường dẫn hoặc xin người mời gửi lại.', 'INVITATION_NOT_FOUND')
    // Không nêu trạng thái của lời mời gửi cho người khác.
    if (!invitationIsFor(invitation, user.value.id)) {
      return problem(403, 'Lời mời này gửi tới một email khác. Hãy đăng nhập bằng tài khoản có email được mời.', 'INVITATION_FOR_OTHER')
    }
    return HttpResponse.json(toInvitationPreview(invitation, club, user.value.id))
  }),
]
