import { describe, expect, it } from 'vitest'
import type { InvitationPreview } from '../model/invitationTypes'
import { invitationPageState, invitationStateLine, invitationTitle, invitationUrl, useCountLabel } from './invitationDisplay'
import { invitationEmailSchema } from './invitationSchema'

const preview = (changes: Partial<Pick<InvitationPreview, 'status' | 'myMembership' | 'allowedActions'>> = {}) => ({
  status: 'ACTIVE' as const,
  myMembership: null,
  allowedActions: ['REQUEST_TO_JOIN' as const],
  ...changes,
})

describe('invitation display (FR-MEM-01)', () => {
  it('builds the full link and encodes the token', () => {
    expect(invitationUrl('demo-guitar', 'https://clb.example')).toBe('https://clb.example/invite/demo-guitar')
    expect(invitationUrl('a/b?c', 'https://clb.example')).toBe('https://clb.example/invite/a%2Fb%3Fc')
  })

  it('names the invitation and says why it can no longer be used', () => {
    expect(invitationTitle({ kind: 'LINK', email: null })).toBe('Liên kết mời')
    expect(invitationTitle({ kind: 'EMAIL', email: 'tu.chau@demo.test' })).toBe('tu.chau@demo.test')
    const base = { expiresAt: '2026-11-20T09:00:00+07:00', revokedAt: '2026-11-16T10:30:00+07:00', revokedBy: { id: 'u-anh', fullName: 'Nguyễn Minh Anh' } }
    expect(invitationStateLine({ ...base, status: 'ACTIVE' })).toBe('Còn hiệu lực đến 20/11/2026 09:00')
    expect(invitationStateLine({ ...base, status: 'EXPIRED' })).toBe('Hết hạn lúc 20/11/2026 09:00')
    expect(invitationStateLine({ ...base, status: 'REVOKED' })).toBe('Thu hồi lúc 16/11/2026 10:30 bởi Nguyễn Minh Anh')
    expect(invitationStateLine({ ...base, status: 'USED' })).toBe('Người được mời đã dùng để gửi yêu cầu gia nhập')
  })

  it('counts uses only for links, which can be used many times', () => {
    expect(useCountLabel({ kind: 'LINK', useCount: 0 })).toBe('Chưa ai dùng')
    expect(useCountLabel({ kind: 'LINK', useCount: 1200 })).toBe('1.200 lượt gửi yêu cầu')
    expect(useCountLabel({ kind: 'EMAIL', useCount: 1 })).toBeNull()
  })

  it('puts the viewer membership before the invitation status on the invitation page', () => {
    expect(invitationPageState(preview())).toBe('JOIN')
    expect(invitationPageState(preview({ myMembership: { status: 'PENDING', exitKind: null, rejectionReason: null }, allowedActions: [] }))).toBe('PENDING')
    expect(invitationPageState(preview({ status: 'EXPIRED', myMembership: { status: 'ON_LEAVE', exitKind: null, rejectionReason: null }, allowedActions: [] }))).toBe('MEMBER')
    // Từng bị từ chối thì vẫn gửi lại được qua lời mời còn hiệu lực.
    expect(invitationPageState(preview({ myMembership: { status: 'LEFT', exitKind: 'REJECTED', rejectionReason: 'Đã đủ người.' } }))).toBe('JOIN')
    expect(invitationPageState(preview({ status: 'REVOKED', allowedActions: [] }))).toBe('REVOKED')
    expect(invitationPageState(preview({ status: 'USED', allowedActions: [] }))).toBe('USED')
    expect(invitationPageState(preview({ status: 'EXPIRED', allowedActions: [] }))).toBe('EXPIRED')
  })
})

describe('invitationEmailSchema', () => {
  it('requires a valid email and trims it', () => {
    expect(invitationEmailSchema.safeParse({ email: '  ' }).error?.issues.map((issue) => issue.message)).toEqual(['Nhập email người được mời.'])
    expect(invitationEmailSchema.safeParse({ email: 'khong-phai-email' }).error?.issues.map((issue) => issue.message)).toEqual(['Email không hợp lệ.'])
    expect(invitationEmailSchema.parse({ email: ' tu.chau@demo.test ' })).toEqual({ email: 'tu.chau@demo.test' })
  })
})
