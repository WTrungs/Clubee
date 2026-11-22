import { http, HttpResponse } from 'msw'
import type {
  ChangePasswordRequest,
  CompletePasswordResetRequest,
  CurrentUser,
  EmailChangeRequest,
  LoginRequest,
  Profile,
  RegisterRequest,
  UpdateProfileRequest,
} from '@/features/account/model/accountTypes'
import { PASSWORD_RESET_MINUTES } from '@/shared/lib/accountRules'
import { imageContentType, validateImageFile } from '@/shared/lib/validateImageFile'
import { db, type DbUser } from '../db'
import { API, csrfRejected, currentUser, fileToDataUrl, networkDelay, newId, problem, writer } from '../mockHttp'
import { departmentNameOf, memberCountOf } from '../mockMembers'
import { completeReset, findResetLink, issueResetLink, resetLinkStatus, toResetLink } from '../mockPasswordResets'
import { positionTitlesOf } from '../mockPermissions'
import { endSession, getSessionUserId, hasValidCsrf, startSession } from '../mockSession'
import { isRealDate, nowIso, vnToday } from '../mockTime'
import { staffEventsOf } from '../mockStaffEvents'
import { newUser } from '../seed/memberSeed'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^0\d{9}$/
const MIN_PASSWORD = 8
const MAX_PASSWORD = 72

function toCurrentUser(user: DbUser): CurrentUser {
  const memberships = db.memberships
    .filter((membership) => membership.userId === user.id && membership.status !== 'LEFT')
    .flatMap((membership) => {
      const club = db.clubs.find((candidate) => candidate.id === membership.clubId)
      if (!club) return []
      return [
        {
          clubId: club.id,
          clubName: club.name,
          shortName: club.shortName,
          logoUrl: club.logoUrl,
          field: club.field,
          memberStatus: membership.status,
          departmentName: departmentNameOf(user.id, club.id),
          positionTitles: positionTitlesOf(user.id, club.id),
          memberCount: memberCountOf(club.id),
        },
      ]
    })
  return { id: user.id, fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl, accountType: user.accountType, memberships, staffEvents: staffEventsOf(user.id) }
}

function toProfile(user: DbUser): Profile {
  return {
    fullName: user.fullName,
    email: user.email,
    pendingEmail: user.pendingEmail,
    phone: user.phone,
    birthDate: user.birthDate,
    avatarUrl: user.avatarUrl,
    version: user.version,
  }
}

/** Mock không lưu mật khẩu tài khoản demo nên nhận mọi chuỗi đủ dài; đã đổi trong phiên demo thì phải khớp. */
function passwordMatches(user: DbUser, password: string): boolean {
  return user.password === null ? password.length >= MIN_PASSWORD : password === user.password
}

const resetLinkNotFound = () => problem(404, 'Liên kết đặt lại mật khẩu không đúng. Mở lại liên kết trong email hoặc gửi yêu cầu mới.', 'RESET_LINK_NOT_FOUND')

const wrongPassword = () =>
  problem(400, 'Mật khẩu hiện tại không đúng.', 'WRONG_PASSWORD', [{ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' }])

function profileErrors(body: Partial<UpdateProfileRequest>) {
  const fullName = (body.fullName ?? '').trim()
  const phone = body.phone ? body.phone.replace(/[\s.-]/g, '') : null
  const birthDate = body.birthDate ?? null
  const birthDateOk = birthDate === null || (isRealDate(birthDate) && birthDate >= '1900-01-01' && birthDate < vnToday())
  return {
    fullName,
    phone,
    birthDate,
    errors: [
      ...(fullName.length < 2 || fullName.length > 100 ? [{ field: 'fullName', message: 'Họ tên cần từ 2 đến 100 ký tự.' }] : []),
      ...(phone !== null && !PHONE_PATTERN.test(phone) ? [{ field: 'phone', message: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.' }] : []),
      ...(!birthDateOk ? [{ field: 'birthDate', message: 'Ngày sinh phải là một ngày có thật trước hôm nay.' }] : []),
    ],
  }
}

export const accountHandlers = [
  http.get(`${API}/me`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    return HttpResponse.json(toCurrentUser(user.value))
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    await networkDelay()
    const body = (await request.json()) as Partial<LoginRequest>
    const email = (body.email ?? '').trim().toLowerCase()
    const user = db.users.find((candidate) => candidate.email.toLowerCase() === email)
    if (!user || !passwordMatches(user, body.password ?? '')) {
      return problem(401, 'Email hoặc mật khẩu không đúng.', 'BAD_CREDENTIALS')
    }
    if (user.status === 'PENDING_VERIFICATION') {
      return problem(403, 'Tài khoản chưa xác thực email. Mở liên kết trong email đăng ký để kích hoạt.', 'EMAIL_NOT_VERIFIED')
    }
    if (user.status === 'LOCKED') return problem(403, 'Tài khoản đang bị khóa. Liên hệ quản trị hệ thống.', 'ACCOUNT_LOCKED')
    user.lastLoginAt = nowIso()
    startSession(user.id)
    return HttpResponse.json(toCurrentUser(user))
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok && user.response.status !== 401) return user.response
    endSession()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    await networkDelay()
    const body = (await request.json()) as Partial<RegisterRequest>
    const fullName = (body.fullName ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const errors = [
      ...(fullName.length < 2 ? [{ field: 'fullName', message: 'Họ tên quá ngắn.' }] : []),
      ...(!EMAIL_PATTERN.test(email) ? [{ field: 'email', message: 'Email không hợp lệ.' }] : []),
      ...((body.password ?? '').length < MIN_PASSWORD || (body.password ?? '').length > MAX_PASSWORD ? [{ field: 'password', message: 'Mật khẩu cần từ 8 đến 72 ký tự.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin đăng ký chưa hợp lệ.', 'VALIDATION', errors)
    if (db.users.some((candidate) => candidate.email.toLowerCase() === email)) {
      return problem(409, 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng quên mật khẩu.', 'EMAIL_TAKEN', [
        { field: 'email', message: 'Email đã được đăng ký. Hãy đăng nhập hoặc dùng Quên mật khẩu.' },
      ])
    }
    db.users.push(newUser({ id: newId('u'), fullName, email, phone: null, status: 'PENDING_VERIFICATION' }))
    return HttpResponse.json({ email }, { status: 201 })
  }),

  http.post(`${API}/auth/password-reset-requests`, async ({ request }) => {
    await networkDelay()
    const body = (await request.json()) as { email?: unknown }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const user = db.users.find((candidate) => candidate.email.toLowerCase() === email)
    // Chỉ tài khoản Hoạt động nhận liên kết; luôn trả 202 để không lộ email nào đã đăng ký.
    if (user?.status === 'ACTIVE') issueResetLink(user)
    return new HttpResponse(null, { status: 202 })
  }),

  http.get(`${API}/auth/password-resets/:token`, async ({ params }) => {
    await networkDelay()
    const reset = findResetLink(String(params.token))
    const user = reset ? db.users.find((candidate) => candidate.id === reset.userId) : undefined
    if (!reset || !user) return resetLinkNotFound()
    return HttpResponse.json(toResetLink(reset, user))
  }),

  http.post(`${API}/auth/password-resets/:token/completion`, async ({ request, params }) => {
    await networkDelay()
    if (!hasValidCsrf(request)) return csrfRejected()
    const reset = findResetLink(String(params.token))
    const user = reset ? db.users.find((candidate) => candidate.id === reset.userId) : undefined
    if (!reset || !user) return resetLinkNotFound()
    const status = resetLinkStatus(reset)
    if (status === 'USED') {
      return problem(422, 'Liên kết đã được dùng hoặc đã có liên kết mới hơn. Gửi yêu cầu mới nếu bạn vẫn cần đặt lại mật khẩu.', 'RESET_LINK_USED')
    }
    if (status === 'EXPIRED') {
      return problem(422, `Liên kết đã hết hạn (chỉ dùng được trong ${PASSWORD_RESET_MINUTES} phút). Gửi yêu cầu mới để nhận liên kết khác.`, 'RESET_LINK_EXPIRED')
    }
    if (user.status === 'LOCKED') return problem(422, 'Tài khoản đang bị khóa nên chưa đặt lại mật khẩu được. Liên hệ quản trị hệ thống.', 'ACCOUNT_LOCKED')
    const body = (await request.json()) as Partial<CompletePasswordResetRequest>
    const next = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (next.length < MIN_PASSWORD || next.length > MAX_PASSWORD) {
      return problem(400, 'Mật khẩu mới chưa hợp lệ.', 'VALIDATION', [{ field: 'newPassword', message: 'Mật khẩu cần từ 8 đến 72 ký tự.' }])
    }
    completeReset(reset, user, next)
    // NFR-SEC-01: đặt lại mật khẩu thu hồi mọi phiên của tài khoản đó.
    if (getSessionUserId() === user.id) endSession()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/me/profile`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    return HttpResponse.json(toProfile(user.value))
  }),

  http.patch(`${API}/me/profile`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const body = (await request.json()) as Partial<UpdateProfileRequest>
    if (body.version !== user.value.version) {
      return problem(409, 'Hồ sơ vừa được cập nhật ở nơi khác. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    }
    const { fullName, phone, birthDate, errors } = profileErrors(body)
    if (errors.length > 0) return problem(400, 'Thông tin cá nhân chưa hợp lệ.', 'VALIDATION', errors)
    Object.assign(user.value, { fullName, phone, birthDate, version: user.value.version + 1 })
    return HttpResponse.json(toProfile(user.value))
  }),

  http.post(`${API}/me/avatar`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return problem(400, 'Thiếu tệp ảnh.', 'VALIDATION')
    const invalid = validateImageFile(file, 'Ảnh đại diện')
    if (invalid) return problem(400, invalid, 'INVALID_FILE')
    Object.assign(user.value, { avatarUrl: await fileToDataUrl(file, imageContentType(file.name) ?? file.type), version: user.value.version + 1 })
    return HttpResponse.json(toProfile(user.value))
  }),

  http.post(`${API}/me/email-change-requests`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const body = (await request.json()) as Partial<EmailChangeRequest>
    const newEmail = (body.newEmail ?? '').trim().toLowerCase()
    if (!EMAIL_PATTERN.test(newEmail)) return problem(400, 'Email mới không hợp lệ.', 'VALIDATION', [{ field: 'newEmail', message: 'Email không hợp lệ.' }])
    if (newEmail === user.value.email.toLowerCase()) {
      return problem(400, 'Email mới trùng email hiện tại.', 'VALIDATION', [{ field: 'newEmail', message: 'Nhập email khác email hiện tại.' }])
    }
    if (!passwordMatches(user.value, body.currentPassword ?? '')) return wrongPassword()
    if (db.users.some((candidate) => candidate.id !== user.value.id && candidate.email.toLowerCase() === newEmail)) {
      return problem(409, 'Email này đã thuộc một tài khoản khác.', 'EMAIL_TAKEN', [{ field: 'newEmail', message: 'Email đã thuộc một tài khoản khác.' }])
    }
    Object.assign(user.value, { pendingEmail: newEmail, version: user.value.version + 1 })
    return HttpResponse.json({ pendingEmail: newEmail }, { status: 202 })
  }),

  http.post(`${API}/me/password`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const body = (await request.json()) as Partial<ChangePasswordRequest>
    const next = body.newPassword ?? ''
    if (next.length < MIN_PASSWORD || next.length > MAX_PASSWORD) {
      return problem(400, 'Mật khẩu mới chưa hợp lệ.', 'VALIDATION', [{ field: 'newPassword', message: 'Mật khẩu cần từ 8 đến 72 ký tự.' }])
    }
    if (!passwordMatches(user.value, body.currentPassword ?? '')) return wrongPassword()
    if (next === body.currentPassword) {
      return problem(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.', 'VALIDATION', [{ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }])
    }
    user.value.password = next
    return new HttpResponse(null, { status: 204 })
  }),
]
