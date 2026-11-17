import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { nowIso, vnDate } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { memberRepository } from '../model/memberRepository'
import type { UpdateMemberInfoRequest } from '../model/memberTypes'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const membershipOf = (membershipId: string) => {
  const membership = db.memberships.find((candidate) => candidate.id === membershipId)
  if (!membership) throw new Error(`Thiếu ${membershipId}`)
  return membership
}

/** Bốn trường như đang lưu, ghi đè những trường cần đổi. */
function request(membershipId: string, changes: Partial<UpdateMemberInfoRequest> = {}): UpdateMemberInfoRequest {
  const membership = membershipOf(membershipId)
  return {
    displayTitle: membership.displayTitle,
    internalNote: membership.internalNote,
    studentId: membership.studentId,
    joinedOn: membership.joinedOn ?? '',
    version: membership.version,
    ...changes,
  }
}

describe('member info in the club (FR-MEM-05)', () => {
  it('saves each changed field with a history line, and shows the note only to the board (SRS 3.5)', async () => {
    signInAs('u-anh')
    const saved = await memberRepository.updateInfo(
      'c-guitar',
      'm-guitar-vy',
      request('m-guitar-vy', { displayTitle: '  Trưởng nhóm nội dung ', internalNote: 'Đang hướng dẫn hai bạn thử việc.', joinedOn: vnDate(-200) }),
    )
    expect(saved).toMatchObject({ displayTitle: 'Trưởng nhóm nội dung', internalNote: 'Đang hướng dẫn hai bạn thử việc.', joinedOn: vnDate(-200), version: 2 })
    expect(saved.infoHistory?.map((change) => change.field).toSorted()).toEqual(['displayTitle', 'internalNote', 'joinedOn'])
    expect(saved.infoHistory?.find((change) => change.field === 'displayTitle')).toMatchObject({ from: 'Biên tập fanpage', to: 'Trưởng nhóm nội dung', actor: { id: 'u-anh' } })
    expect(saved.allowedActions).toContain('EDIT_INFO')

    signInAs('u-ha')
    const seen = await memberRepository.get('c-guitar', 'm-guitar-vy')
    expect(seen).toMatchObject({ displayTitle: 'Trưởng nhóm nội dung', internalNote: null, infoHistory: null })
    expect(seen.allowedActions).not.toContain('EDIT_INFO')
    const found = await memberRepository.list('c-guitar', { q: 'nội dung' })
    expect(found.content.map((member) => member.membershipId)).toEqual(['m-guitar-vy'])
  })

  it('keeps the version when nothing changed, so a parallel editor gets no false conflict', async () => {
    signInAs('u-anh')
    const saved = await memberRepository.updateInfo('c-guitar', 'm-guitar-vy', request('m-guitar-vy'))
    expect(saved.version).toBe(1)
    expect(saved.infoHistory).toEqual([])
  })

  it('refuses people without the member permission, stale versions and members who left', async () => {
    signInAs('u-ha')
    expect((await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-vy', request('m-guitar-vy', { displayTitle: 'Tự đặt' }))))?.status).toBe(403)
    expect(membershipOf('m-guitar-vy').displayTitle).toBe('Biên tập fanpage')

    signInAs('u-anh')
    const stale = await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-vy', request('m-guitar-vy', { displayTitle: 'Mới', version: 0 })))
    expect(stale?.status).toBe(409)
    const left = await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-dat', request('m-guitar-dat', { displayTitle: 'Cựu thành viên' })))
    expect(left).toMatchObject({ status: 422, code: 'MEMBER_LEFT' })
    expect((await memberRepository.get('c-guitar', 'm-guitar-dat')).allowedActions).not.toContain('EDIT_INFO')
  })

  it('follows the permission matrix (FR-ORG-05)', async () => {
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false, updatedBy: 'u-anh', updatedAt: nowIso() })
    signInAs('u-mai')
    expect((await memberRepository.get('c-guitar', 'm-guitar-vy')).allowedActions).not.toContain('EDIT_INFO')
    expect((await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-vy', request('m-guitar-vy', { displayTitle: 'Mới' }))))?.status).toBe(403)
  })

  it('checks lengths, student ids and the join date against today, the club, the positions and the last exit', async () => {
    signInAs('u-anh')
    const errors = async (membershipId: string, changes: Partial<UpdateMemberInfoRequest>) =>
      (await fail(memberRepository.updateInfo('c-guitar', membershipId, request(membershipId, changes))))?.fieldErrors.map((error) => error.field)

    expect(await errors('m-guitar-vy', { displayTitle: 'x'.repeat(61), internalNote: 'y'.repeat(1001), studentId: 'ab' })).toEqual([
      'displayTitle',
      'internalNote',
      'studentId',
    ])
    expect(await errors('m-guitar-vy', { joinedOn: vnDate(1) })).toEqual(['joinedOn'])
    expect(await errors('m-guitar-vy', { joinedOn: '2026-02-30' })).toEqual(['joinedOn'])
    expect(await errors('m-guitar-vy', { joinedOn: '2015-01-01' })).toEqual(['joinedOn'])
    // Linh làm Trưởng ban từ 315 ngày trước (nhiệm kỳ đã đóng) nên không thể gia nhập sau ngày đó (BR-ORG-01).
    expect(await errors('m-guitar-linh', { joinedOn: vnDate(-100) })).toEqual(['joinedOn'])
    expect((await memberRepository.updateInfo('c-guitar', 'm-guitar-linh', request('m-guitar-linh', { joinedOn: vnDate(-320) }))).joinedOn).toBe(vnDate(-320))

    // Phương từng rời CLB 250 ngày trước nên lần gia nhập mới không thể sớm hơn.
    const phuong = membershipOf('m-guitar-phuong')
    await memberRepository.transition('c-guitar', 'm-guitar-phuong', { action: 'APPROVE_ACTIVE', departmentId: 'd-media', version: phuong.version })
    expect(await errors('m-guitar-phuong', { joinedOn: vnDate(-300) })).toEqual(['joinedOn'])
  })

  it('checks the join date bounds only when the date changes, so old data never blocks other fields', async () => {
    signInAs('u-anh')
    const quan = membershipOf('m-guitar-quan')
    await memberRepository.transition('c-guitar', 'm-guitar-quan', { action: 'APPROVE_ACTIVE', departmentId: 'd-music', version: quan.version })
    // Gán chức vụ cho phép bắt đầu từ đầu nhiệm kỳ, tức trước ngày Quân vừa gia nhập hôm nay.
    const termStart = db.terms.find((term) => term.id === 't-guitar-2026')?.startOn ?? ''
    grantPosition({ userId: 'u-quan', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-music', assignedBy: 'u-anh', startOn: termStart })

    const saved = await memberRepository.updateInfo('c-guitar', 'm-guitar-quan', request('m-guitar-quan', { displayTitle: 'Phụ trách bè giữa' }))
    expect(saved.displayTitle).toBe('Phụ trách bè giữa')
    const moved = await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-quan', request('m-guitar-quan', { joinedOn: vnDate(-1) })))
    expect(moved?.fieldErrors).toEqual([{ field: 'joinedOn', message: expect.stringContaining('không được sau ngày bắt đầu chức vụ đầu tiên') }])
  })

  it('refuses a body with missing fields or an impossible date instead of clearing data or failing', async () => {
    signInAs('u-anh')
    const { internalNote: _note, ...partial } = request('m-guitar-vy', { internalNote: 'Giữ nguyên' })
    const missing = await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-vy', partial as UpdateMemberInfoRequest))
    expect(missing).toMatchObject({ status: 400, fieldErrors: [{ field: 'internalNote', message: 'Thiếu trường này trong yêu cầu.' }] })
    const month13 = await fail(memberRepository.updateInfo('c-guitar', 'm-guitar-vy', request('m-guitar-vy', { joinedOn: '2026-13-01' })))
    expect(month13).toMatchObject({ status: 400, fieldErrors: [{ field: 'joinedOn', message: 'Ngày gia nhập không hợp lệ.' }] })
  })

  it('ignores the student id when the club does not collect it', async () => {
    signInAs('u-tu')
    const saved = await memberRepository.updateInfo('c-english', 'm-english-tam', request('m-english-tam', { studentId: '26001234', displayTitle: 'Phụ trách CLB nói' }))
    expect(saved.studentId).toBeNull()
    expect(membershipOf('m-english-tam').studentId).toBeNull()
    expect(saved.infoHistory?.map((change) => change.field)).toEqual(['displayTitle'])
  })
})
