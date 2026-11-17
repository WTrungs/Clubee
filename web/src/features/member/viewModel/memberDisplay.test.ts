import { describe, expect, it } from 'vitest'
import { joinRequestSchema } from './joinRequestSchema'
import type { MemberTransitionAction } from '../model/memberTypes'
import { approvalTargets, memberDetailActions, reasonRequired, removalSummary } from './memberDisplay'

describe('member display rules', () => {
  it('shows only the transitions the server allows, in a fixed order (ST-MEM)', () => {
    expect(memberDetailActions(['REMOVE', 'PUT_ON_LEAVE'])).toEqual(['PUT_ON_LEAVE', 'REMOVE'])
    expect(memberDetailActions(['REMOVE', 'CONFIRM'])).toEqual(['CONFIRM', 'REMOVE'])
    expect(memberDetailActions(['APPROVE_ACTIVE', 'REJECT'])).toEqual([])
  })

  it('requires a reason for every transition except approval (FR-MEM-03, 06, 08)', () => {
    expect(reasonRequired('APPROVE_PROBATION')).toBe(false)
    expect(reasonRequired('APPROVE_ACTIVE')).toBe(false)
    const withReason: MemberTransitionAction[] = ['REJECT', 'CONFIRM', 'PUT_ON_LEAVE', 'RETURN', 'REMOVE']
    expect(withReason.every(reasonRequired)).toBe(true)
  })

  it('offers probation first only when the club uses that step (SRS 9.2)', () => {
    expect(approvalTargets(['APPROVE_PROBATION', 'APPROVE_ACTIVE', 'REJECT']).map((target) => target.status)).toEqual(['PROBATION', 'ACTIVE'])
    expect(approvalTargets(['APPROVE_ACTIVE', 'REJECT']).map((target) => target.status)).toEqual(['ACTIVE'])
  })

  it('mentions the backlog after removing a member', () => {
    expect(removalSummary('Bùi Đức Long', 3)).toBe('Đã đưa Bùi Đức Long ra khỏi CLB. 3 mục tồn đọng chờ gán lại.')
    expect(removalSummary('Bùi Đức Long', 0)).toBe('Đã đưa Bùi Đức Long ra khỏi CLB.')
  })
})

describe('join request form (FR-MEM-02)', () => {
  const introduction = 'Mình muốn tập đệm hát cùng mọi người.'

  it('requires the student id only when the club collects it', () => {
    expect(joinRequestSchema(true).safeParse({ introduction, studentId: '' }).success).toBe(false)
    expect(joinRequestSchema(true).safeParse({ introduction, studentId: '26001003' }).success).toBe(true)
    expect(joinRequestSchema(false).safeParse({ introduction, studentId: '' }).success).toBe(true)
  })

  it('needs a short introduction', () => {
    const result = joinRequestSchema(false).safeParse({ introduction: 'Chào', studentId: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('ít nhất 10 ký tự')
  })
})
