import { describe, expect, it } from 'vitest'
import type { BacklogItem } from '../model/backlogTypes'
import {
  backlogActionLabel,
  backlogKindDisplay,
  backlogOutcome,
  backlogStatusDisplay,
  groupByFormerMember,
  parseBacklogKind,
  parseBacklogStatus,
  resolvedToast,
  resolveSheetText,
} from './backlogDisplay'

const long = { id: 'u-long', fullName: 'Phan Văn Long' }
const item = (overrides: Partial<BacklogItem>): BacklogItem => ({
  id: 'b1',
  kind: 'TASK',
  formerMember: long,
  status: 'OPEN',
  title: 'Chuẩn bị âm thanh',
  task: null,
  position: null,
  resolution: null,
  resolvedNote: null,
  appointBlockedReason: null,
  createdAt: '2026-11-14T09:00:00+07:00',
  allowedActions: ['REASSIGN'],
  version: 1,
  ...overrides,
})

describe('backlog labels (FR-MEM-09)', () => {
  it('names every kind and status with words', () => {
    expect(Object.values(backlogKindDisplay).map((display) => display.label)).toEqual(['Chức vụ', 'Việc đang làm', 'Việc chờ nghiệm thu'])
    expect(Object.values(backlogStatusDisplay).map((display) => display.label)).toEqual(['Chưa xử lý', 'Đã xử lý'])
  })

  it('labels the reassign button by what changes hands', () => {
    expect(backlogActionLabel('REASSIGN', 'TASK')).toBe('Giao lại')
    expect(backlogActionLabel('REASSIGN', 'TASK_REVIEW')).toBe('Đổi người nghiệm thu')
    expect(backlogActionLabel('APPOINT', 'POSITION')).toBe('Chỉ định người thay')
    expect(backlogActionLabel('DISMISS', 'POSITION')).toBe('Không cần thay')
    expect(resolveSheetText(item({ kind: 'TASK_REVIEW' }), 'REASSIGN')).toMatchObject({ title: 'Đổi người nghiệm thu', submitLabel: 'Đổi người nghiệm thu' })
    expect(resolveSheetText(item({ kind: 'POSITION', title: 'Trưởng ban Hậu cần' }), 'APPOINT').description).toBe('Trưởng ban Hậu cần, thay Phan Văn Long. Người được chọn nhận chức từ hôm nay.')
  })

  it('describes how an item was settled, or why it settled itself', () => {
    const by = { id: 'u-anh', fullName: 'Nguyễn Minh Anh' }
    const at = '2026-11-14T14:00:00Z'
    expect(backlogOutcome(item({ resolution: { action: 'REASSIGN', person: { id: 'u-tram', fullName: 'Ngô Bảo Trâm' }, reason: null, by, at } }))).toBe(
      'Đã giao lại cho Ngô Bảo Trâm · Nguyễn Minh Anh, 14/11/2026 21:00',
    )
    expect(backlogOutcome(item({ kind: 'TASK_REVIEW', resolution: { action: 'REASSIGN', person: { id: 'u-mai', fullName: 'Võ Ngọc Mai' }, reason: null, by, at } }))).toMatch(/^Võ Ngọc Mai nghiệm thu thay · /)
    expect(backlogOutcome(item({ kind: 'POSITION', resolution: { action: 'DISMISS', person: null, reason: 'Gộp tiểu ban.', by, at } }))).toMatch(/^Không cần thay: Gộp tiểu ban\. · /)
    expect(backlogOutcome(item({ status: 'RESOLVED', resolvedNote: 'Việc đã hoàn thành.' }))).toBe('Việc đã hoàn thành.')
    expect(backlogOutcome(item({}))).toBeNull()
    expect(resolvedToast({ kind: 'TASK' }, 'REASSIGN', 'Ngô Bảo Trâm')).toBe('Đã giao lại việc cho Ngô Bảo Trâm.')
    expect(resolvedToast({ kind: 'POSITION' }, 'APPOINT', 'Võ Ngọc Mai')).toBe('Đã chỉ định Võ Ngọc Mai.')
  })

  it('groups by former member in server order', () => {
    const huy = { id: 'u-huy', fullName: 'Đỗ Quang Huy' }
    const groups = groupByFormerMember([item({ id: 'a' }), item({ id: 'b', formerMember: huy }), item({ id: 'c' })])
    expect(groups.map((group) => [group.person.id, group.items.map((entry) => entry.id)])).toEqual([
      ['u-long', ['a', 'c']],
      ['u-huy', ['b']],
    ])
  })

  it('reads filters safely', () => {
    expect(parseBacklogStatus('RESOLVED')).toBe('RESOLVED')
    expect(parseBacklogStatus('nope')).toBe('OPEN')
    expect(parseBacklogKind('TASK_REVIEW')).toBe('TASK_REVIEW')
    expect(parseBacklogKind(null)).toBe('')
  })
})
