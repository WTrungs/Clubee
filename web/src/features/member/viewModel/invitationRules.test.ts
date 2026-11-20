import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS
const introduction = 'Mình chơi guitar được một năm, muốn tham gia các đêm nhạc của CLB.'
const join = (token: string) => memberRepository.requestToJoin('c-guitar', { introduction, studentId: 'SV26001', invitationToken: token })
const membershipsOf = (userId: string) => db.memberships.filter((membership) => membership.userId === userId && membership.clubId === 'c-guitar')

describe('managing invitations (FR-MEM-01)', () => {
  it('lists the club invitations with derived status, newest first, for the board only', async () => {
    signInAs('u-anh')
    const all = await memberRepository.invitations('c-guitar', {})
    expect(all.content.map((invitation) => [invitation.id, invitation.status])).toEqual([
      ['inv-guitar-link', 'ACTIVE'],
      ['inv-guitar-tam', 'EXPIRED'],
    ])
    expect(all.content[0]).toMatchObject({ kind: 'LINK', token: 'demo-guitar', useCount: 1, createdBy: { id: 'u-anh' }, allowedActions: ['REVOKE'] })
    expect(all.content[1]?.allowedActions).toEqual([])
    expect((await memberRepository.invitations('c-guitar', { status: 'EXPIRED' })).content.map((invitation) => invitation.id)).toEqual(['inv-guitar-tam'])

    signInAs('u-ha')
    expect(await fail(memberRepository.invitations('c-guitar', {}))).toMatchObject({ status: 403, detail: 'Chỉ ban chủ nhiệm được xem lời mời gia nhập.' })
    expect(await fail(memberRepository.createInvitation('c-guitar', { kind: 'LINK' }))).toMatchObject({ status: 403 })
    signInAs('u-tu')
    expect(await fail(memberRepository.invitations('c-guitar', {}))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })

  it('sets the expiry from the club setting at creation, and keeps it when the setting changes later (FR-CLB-03)', async () => {
    signInAs('u-anh')
    const first = await memberRepository.createInvitation('c-guitar', { kind: 'LINK' })
    expect(first).toMatchObject({ kind: 'LINK', status: 'ACTIVE', email: null, useCount: 0, version: 1 })
    expect(first.token).toMatch(/^[0-9a-f]{32}$/)
    expect(daysBetween(first.createdAt, first.expiresAt)).toBe(7)

    const settings = await clubRepository.settings('c-guitar')
    await clubRepository.updateSettings('c-guitar', { ...settings, inviteLinkDays: 14 })
    const second = await memberRepository.createInvitation('c-guitar', { kind: 'LINK' })
    expect(daysBetween(second.createdAt, second.expiresAt)).toBe(14)
    const kept = (await memberRepository.invitations('c-guitar', {})).content.find((invitation) => invitation.id === first.id)
    expect(kept?.expiresAt).toBe(first.expiresAt)
  })

  it('invites by email once per person, refuses current members and pending applicants, and tells an existing account', async () => {
    signInAs('u-anh')
    expect((await fail(memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'khong-phai-email' })))?.fieldErrors).toEqual([
      { field: 'email', message: 'Email không hợp lệ.' },
    ])
    expect(await fail(memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'ha.le@demo.test' }))).toMatchObject({ status: 409, code: 'ALREADY_MEMBER' })
    const pending = await fail(memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'quan.truong@demo.test' }))
    expect(pending).toMatchObject({ status: 409, code: 'ALREADY_MEMBER', detail: expect.stringContaining('chờ duyệt') })

    const invited = await memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: ' Tu.Chau@Demo.test ' })
    expect(invited).toMatchObject({ kind: 'EMAIL', email: 'tu.chau@demo.test', status: 'ACTIVE' })
    expect(await fail(memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'TU.CHAU@demo.test' }))).toMatchObject({ status: 409, code: 'INVITATION_EXISTS' })
    // Lời mời cũ đã hết hạn của Tâm không chặn lời mời mới.
    expect((await memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'tam.duong@demo.test' })).status).toBe('ACTIVE')

    signInAs('u-tu')
    const [latest] = (await notificationRepository.list({ category: 'MEMBERSHIP' })).content
    expect(latest).toMatchObject({ title: 'Bạn được mời gia nhập CLB Guitar Sinh viên', target: { type: 'INVITATION', clubId: 'c-guitar', id: invited.token } })
  })

  it('revokes only an active invitation with the current version', async () => {
    signInAs('u-anh')
    const created = await memberRepository.createInvitation('c-guitar', { kind: 'LINK' })
    expect(await fail(memberRepository.revokeInvitation('c-guitar', created.id, created.version + 1))).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    const revoked = await memberRepository.revokeInvitation('c-guitar', created.id, created.version)
    expect(revoked).toMatchObject({ status: 'REVOKED', revokedBy: { id: 'u-anh' }, allowedActions: [], version: 2 })
    expect(await fail(memberRepository.revokeInvitation('c-guitar', created.id, revoked.version))).toMatchObject({ status: 422, code: 'INVITATION_NOT_ACTIVE' })
    expect(await fail(memberRepository.revokeInvitation('c-guitar', 'inv-guitar-tam', 1))).toMatchObject({ status: 422, code: 'INVITATION_NOT_ACTIVE' })
    expect(await fail(memberRepository.revokeInvitation('c-guitar', 'inv-khong-co', 1))).toMatchObject({ status: 404 })
  })
})

describe('opening and using an invitation (FR-MEM-01, FR-MEM-02, BR-MEM-01)', () => {
  it('shows public club info and the inviter, and offers to join only to people without a current membership', async () => {
    signInAs('u-tu')
    const preview = await memberRepository.invitationPreview('demo-guitar')
    expect(preview).toMatchObject({ status: 'ACTIVE', kind: 'LINK', invitedBy: { id: 'u-anh' }, myMembership: null, allowedActions: ['REQUEST_TO_JOIN'] })
    expect(preview.club).toMatchObject({ id: 'c-guitar', name: 'CLB Guitar Sinh viên', collectsStudentId: true })
    expect(Object.keys(preview.club)).not.toContain('rules')

    signInAs('u-ha')
    expect(await memberRepository.invitationPreview('demo-guitar')).toMatchObject({ myMembership: { status: 'ACTIVE' }, allowedActions: [] })
    expect(await fail(memberRepository.invitationPreview('khong-co-ma'))).toMatchObject({ status: 404, code: 'INVITATION_NOT_FOUND' })
    // Lời mời email của người khác: không nêu trạng thái.
    expect(await fail(memberRepository.invitationPreview('demo-guitar-old'))).toMatchObject({ status: 403, code: 'INVITATION_FOR_OTHER' })

    signInAs('u-tam')
    expect(await memberRepository.invitationPreview('demo-guitar-old')).toMatchObject({ status: 'EXPIRED', allowedActions: [] })
  })

  it('still creates a pending request through a link, records the inviter and counts the use', async () => {
    signInAs('u-tu')
    const receipt = await join('demo-guitar')
    expect(receipt.status).toBe('PENDING')
    expect(db.invitations.find((invitation) => invitation.id === 'inv-guitar-link')?.useCount).toBe(2)
    expect((await memberRepository.invitationPreview('demo-guitar')).myMembership).toMatchObject({ status: 'PENDING' })

    signInAs('u-anh')
    const requests = await memberRepository.joinRequests('c-guitar', {})
    expect(requests.content.find((request) => request.applicant.id === 'u-tu')?.invitedBy).toMatchObject({ id: 'u-anh' })
    expect(requests.content.find((request) => request.applicant.id === 'u-quan')?.invitedBy).toMatchObject({ id: 'u-anh' })
    expect(requests.content.find((request) => request.applicant.id === 'u-phuong')?.invitedBy).toBeNull()
  })

  it('refuses revoked, expired and used invitations without creating a membership', async () => {
    signInAs('u-anh')
    const link = await memberRepository.createInvitation('c-guitar', { kind: 'LINK' })
    await memberRepository.revokeInvitation('c-guitar', link.id, link.version)
    const email = await memberRepository.createInvitation('c-guitar', { kind: 'EMAIL', email: 'tu.chau@demo.test' })

    signInAs('u-tu')
    expect(await fail(join(link.token))).toMatchObject({ status: 422, code: 'INVITATION_NOT_ACTIVE' })
    expect(membershipsOf('u-tu')).toEqual([])
    expect(await fail(join('khong-co-ma'))).toMatchObject({ status: 422, code: 'INVITATION_NOT_ACTIVE' })

    signInAs('u-tam')
    expect(await fail(join('demo-guitar-old'))).toMatchObject({ status: 422, code: 'INVITATION_NOT_ACTIVE' })
    expect(await fail(join(email.token))).toMatchObject({ status: 403, code: 'INVITATION_FOR_OTHER' })
    expect(membershipsOf('u-tam')).toEqual([])

    // Lời mời email dùng một lần.
    signInAs('u-tu')
    expect((await join(email.token)).status).toBe('PENDING')
    expect((await memberRepository.invitationPreview(email.token)).status).toBe('USED')
  })
})
