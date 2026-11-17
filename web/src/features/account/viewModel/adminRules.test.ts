import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { newUser } from '@/api/mocks/seed/memberSeed'
import { clubRepository } from '@/features/club/model/clubRepository'
import { signInAs } from '@/testUtils'
import { accountRepository } from '../model/accountRepository'
import { adminRepository } from '../model/adminRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const userOf = (userId: string) => {
  const user = db.users.find((candidate) => candidate.id === userId)
  if (!user) throw new Error(`Thiếu ${userId}`)
  return user
}
const PASSWORD = 'mat-khau-demo'

describe('admin routes are for admin accounts only (SRS 3.4)', () => {
  it('refuses a normal account on every admin route', async () => {
    signInAs('u-anh')
    for (const call of [adminRepository.metrics(), adminRepository.accounts({ email: 'demo' }), adminRepository.sendPasswordReset('u-ha')]) {
      expect(await fail(call)).toMatchObject({ status: 403, code: 'ADMIN_ONLY' })
    }
    expect(await fail(adminRepository.transition('u-ha', { action: 'LOCK', reason: 'Thử khóa.', version: 0 }))).toMatchObject({ status: 403, code: 'ADMIN_ONLY' })
    expect(userOf('u-ha').status).toBe('ACTIVE')
  })

  it('keeps the admin out of every club route, including creating a club (NFR-SEC-06)', async () => {
    signInAs('u-admin')
    expect(await fail(clubRepository.getClub('c-guitar'))).toMatchObject({ status: 403, code: 'ADMIN_ACCOUNT' })
    expect(await fail(clubRepository.directory({}))).toMatchObject({ status: 403, code: 'ADMIN_ACCOUNT' })
    expect(await fail(clubRepository.create({ name: 'CLB của Admin', shortName: 'ADM', field: 'Khác', description: 'Không được phép tạo CLB này.' }))).toMatchObject({ status: 403 })
    expect(await fail(httpClient.get('/invitations/demo-guitar'))).toMatchObject({ status: 403, code: 'ADMIN_ACCOUNT' })
    expect(await accountRepository.getMe()).toMatchObject({ accountType: 'ADMIN', memberships: [] })
  })
})

describe('searching accounts and metrics (FR-ACC-09)', () => {
  it('needs at least three characters and returns account data without phone numbers or club names', async () => {
    signInAs('u-admin')
    expect(await fail(adminRepository.accounts({ email: 'ha' }))).toMatchObject({ status: 400, fieldErrors: [{ field: 'email', message: 'Nhập ít nhất 3 ký tự.' }] })
    const found = await adminRepository.accounts({ email: 'HA.LE' })
    expect(found.content).toHaveLength(1)
    expect(found.content[0]).toMatchObject({ id: 'u-ha', status: 'ACTIVE', accountType: 'USER', clubCount: 2, allowedActions: ['LOCK', 'SEND_PASSWORD_RESET'] })
    expect(Object.keys(found.content[0] ?? {})).not.toContain('phone')
    expect((await adminRepository.accounts({ email: 'khanh.vuong' })).content[0]).toMatchObject({ status: 'LOCKED', allowedActions: ['UNLOCK'] })
    expect((await adminRepository.accounts({ email: 'admin@' })).content[0]?.allowedActions).toEqual(['SEND_PASSWORD_RESET'])
  })

  it('counts accounts by status and recent logins from the seed', async () => {
    signInAs('u-admin')
    const metrics = await adminRepository.metrics()
    const users = db.users.filter((user) => user.accountType === 'USER')
    expect(metrics).toMatchObject({
      clubCount: 3,
      accounts: { ACTIVE: users.length - 2, LOCKED: 1, PENDING_VERIFICATION: 1 },
      pendingTransferRequests: 0,
      systemErrorsLast24h: 0,
    })
    // Tâm đăng nhập lần cuối 45 ngày trước, Khánh 90 ngày, Lan chưa đăng nhập.
    expect(metrics.activeLast30Days).toBe(users.length - 3)
  })
})

describe('locking and unlocking accounts (FR-ACC-09, ST-ACC, NFR-SEC-05)', () => {
  it('locks with a reason, ends the open session, logs before and after, then unlocks', async () => {
    signInAs('u-admin')
    const ha = (await adminRepository.accounts({ email: 'ha.le' })).content[0]
    if (!ha) throw new Error('Thiếu u-ha')
    expect((await fail(adminRepository.transition('u-ha', { action: 'LOCK', reason: 'ab', version: ha.version })))?.fieldErrors).toEqual([
      { field: 'reason', message: 'Nhập từ 5 đến 500 ký tự.' },
    ])
    expect(await fail(adminRepository.transition('u-ha', { action: 'LOCK', reason: 'Spam tin nhắn.', version: ha.version + 1 }))).toMatchObject({ status: 409 })
    const locked = await adminRepository.transition('u-ha', { action: 'LOCK', reason: 'Gửi tin nhắn rác cho nhiều thành viên.', version: ha.version })
    expect(locked).toMatchObject({ status: 'LOCKED', lockReason: 'Gửi tin nhắn rác cho nhiều thành viên.', allowedActions: ['UNLOCK'], version: ha.version + 1 })
    expect(db.auditLogs.at(-1)).toMatchObject({
      actorId: 'u-admin',
      action: 'LOCK_ACCOUNT',
      objectId: 'u-ha',
      before: { status: 'ACTIVE', lockReason: null },
      after: { status: 'LOCKED', lockReason: 'Gửi tin nhắn rác cho nhiều thành viên.' },
      reason: 'Gửi tin nhắn rác cho nhiều thành viên.',
    })

    // Phiên đang mở của người bị khóa hết hiệu lực, và không đăng nhập lại được.
    signInAs('u-ha')
    expect(await fail(accountRepository.getMe())).toMatchObject({ status: 401, code: 'ACCOUNT_LOCKED' })
    expect(await fail(accountRepository.login({ email: 'ha.le@demo.test', password: PASSWORD }))).toMatchObject({ status: 403, code: 'ACCOUNT_LOCKED' })

    signInAs('u-admin')
    const unlocked = await adminRepository.transition('u-ha', { action: 'UNLOCK', reason: 'Đã xác minh, mở lại.', version: locked.version })
    expect(unlocked).toMatchObject({ status: 'ACTIVE', lockReason: null, lockedAt: null })
    const signedIn = await accountRepository.login({ email: 'ha.le@demo.test', password: PASSWORD })
    expect(signedIn.id).toBe('u-ha')
    expect(Date.now() - Date.parse(userOf('u-ha').lastLoginAt ?? '')).toBeLessThan(60_000)
  })

  it('refuses self locks, other admins, unverified accounts and unlocking an active account', async () => {
    db.users.push(newUser({ id: 'u-admin-2', fullName: 'Quản trị thứ hai', email: 'admin2@demo.test', phone: null, status: 'ACTIVE', accountType: 'ADMIN' }))
    signInAs('u-admin')
    const lock = (userId: string, reason = 'Thử khóa tài khoản.') => fail(adminRepository.transition(userId, { action: 'LOCK', reason, version: userOf(userId).version }))
    expect(await lock('u-admin')).toMatchObject({ status: 422, code: 'SELF_LOCK' })
    expect(await lock('u-admin-2')).toMatchObject({ status: 422, code: 'ADMIN_TARGET' })
    expect(await lock('u-lan')).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect(await lock('u-khanh')).toMatchObject({ status: 422, code: 'INVALID_TRANSITION' })
    expect(await fail(adminRepository.transition('u-ha', { action: 'UNLOCK', reason: 'Mở khóa nhầm.', version: userOf('u-ha').version }))).toMatchObject({
      status: 422,
      code: 'INVALID_TRANSITION',
    })
    expect(await fail(adminRepository.transition('u-khong-co', { action: 'LOCK', reason: 'Không có ai.', version: 0 }))).toMatchObject({ status: 404 })
  })

  it('sends a password reset link only to active accounts, and logs it', async () => {
    signInAs('u-admin')
    const before = db.auditLogs.length
    await adminRepository.sendPasswordReset('u-ha')
    expect(db.auditLogs).toHaveLength(before + 1)
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'SEND_PASSWORD_RESET', objectId: 'u-ha' })
    expect(await fail(adminRepository.sendPasswordReset('u-khanh'))).toMatchObject({ status: 422, code: 'ACCOUNT_LOCKED' })
    expect(await fail(adminRepository.sendPasswordReset('u-lan'))).toMatchObject({ status: 422 })
  })
})
