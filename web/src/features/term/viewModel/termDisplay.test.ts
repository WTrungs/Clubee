import { describe, expect, it } from 'vitest'
import type { Term } from '../model/termTypes'
import {
  extensionPreviewText,
  groupTerms,
  isTermOverdue,
  overdueHintText,
  planEntryKind,
  planSummary,
  termLifecycleSteps,
  termPeriod,
  termRemainingText,
  termStatusDisplay,
} from './termDisplay'

const term = (overrides: Partial<Term>): Term => ({
  id: 't',
  name: 'Nhiệm kỳ',
  startOn: '2026-01-01',
  endOn: '2026-12-31',
  status: 'RUNNING',
  createdAt: '2026-01-01T09:00:00+07:00',
  createdBy: null,
  closedAt: null,
  departmentPlan: null,
  handoverId: null,
  handoverProgress: null,
  extensions: [],
  positionsEndingWithTerm: null,
  allowedActions: [],
  version: 1,
  ...overrides,
})

describe('term status and lifecycle (ST-TERM)', () => {
  it('labels every status with a word, not only a color', () => {
    expect(Object.values(termStatusDisplay).map((display) => display.label)).toEqual(['Chuẩn bị', 'Đang chạy', 'Đang bàn giao', 'Đã đóng'])
  })

  it('marks steps before the current one as done', () => {
    expect(termLifecycleSteps('HANDING_OVER').map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming'])
    expect(termLifecycleSteps('PREPARING').map((step) => step.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming'])
    expect(termLifecycleSteps('CLOSED').every((step) => step.state === 'done')).toBe(true)
  })

  it('shows the period in dd/mm/yyyy', () => {
    expect(termPeriod({ startOn: '2026-09-01', endOn: '2027-08-31' })).toBe('01/09/2026 – 31/08/2027')
  })

  it('counts the days left, treating the end date as part of the term', () => {
    const now = new Date('2026-11-14T10:00:00+07:00')
    expect(termRemainingText('2026-11-20', now)).toBe('Còn 6 ngày')
    expect(termRemainingText('2026-11-14', now)).toBe('Kết thúc hôm nay')
    expect(termRemainingText('2026-11-10', now)).toBe('Đã quá ngày kết thúc 4 ngày')
  })

  it('treats a running term as overdue only from the day after its end date (BR-TERM-02)', () => {
    const now = new Date('2026-11-14T23:30:00+07:00')
    expect(isTermOverdue({ status: 'RUNNING', endOn: '2026-11-14' }, now)).toBe(false)
    expect(isTermOverdue({ status: 'RUNNING', endOn: '2026-11-13' }, now)).toBe(true)
    // Đang bàn giao thì đã có lời nhắc riêng, không tính là quá hạn.
    expect(isTermOverdue({ status: 'HANDING_OVER', endOn: '2026-11-13' }, now)).toBe(false)
  })

  it('splits the list into the term in charge, the preparing term and closed terms', () => {
    const groups = groupTerms([term({ id: 'p', status: 'PREPARING' }), term({ id: 'h', status: 'HANDING_OVER' }), term({ id: 'c1', status: 'CLOSED' }), term({ id: 'c2', status: 'CLOSED' })])
    expect(groups.current?.id).toBe('h')
    expect(groups.preparing?.id).toBe('p')
    expect(groups.past.map((item) => item.id)).toEqual(['c1', 'c2'])
    expect(groupTerms([])).toEqual({ current: null, preparing: null, past: [] })
  })
})

describe('department plan summary (FR-TERM-01)', () => {
  const kept = { departmentId: 'd-1', dropped: false, name: 'Hậu cần', currentName: 'Hậu cần' }
  const renamed = { departmentId: 'd-2', dropped: false, name: 'Truyền thông – Nội dung', currentName: 'Truyền thông' }
  const fresh = { departmentId: null, dropped: false, name: 'Sự kiện', currentName: null }
  const dropped = { departmentId: 'd-3', dropped: true, name: 'Thiết kế', currentName: 'Thiết kế' }

  it('tells keep, rename, new and drop apart', () => {
    expect([kept, renamed, fresh, dropped].map(planEntryKind)).toEqual(['KEEP', 'RENAME', 'NEW', 'DROP'])
    expect(planEntryKind({ ...kept, name: '  Hậu cần ' })).toBe('KEEP')
  })

  it('counts renamed departments as kept and leaves zero parts out', () => {
    expect(planSummary([kept, renamed, fresh, dropped])).toBe('Giữ 2 ban · đổi tên 1 · thêm 1 · bỏ 1')
    expect(planSummary([kept, kept])).toBe('Giữ 2 ban')
    expect(planSummary([])).toBe('Giữ 0 ban')
  })
})

describe('term extension texts (FR-TERM-02)', () => {
  it('tells how many standing positions move, with the date once it is valid', () => {
    expect(extensionPreviewText(5, '2027-12-31')).toBe('5 chức vụ thường trực dời hạn tới 31/12/2027.')
    expect(extensionPreviewText(5, null)).toBe('5 chức vụ thường trực hết hạn cùng nhiệm kỳ sẽ dời theo ngày mới.')
    expect(extensionPreviewText(0, '2027-12-31')).toContain('Không có chức vụ thường trực nào')
  })

  it('suggests only what the viewer can do on an overdue term', () => {
    expect(overdueHintText({ create: true, startHandover: false, extend: true })).toBe('Hãy khai báo nhiệm kỳ mới rồi bàn giao. Chưa bầu được ban chủ nhiệm mới thì gia hạn nhiệm kỳ.')
    expect(overdueHintText({ create: false, startHandover: true, extend: false })).toBe('Hãy bắt đầu bàn giao sang nhiệm kỳ kế tiếp.')
    expect(overdueHintText({ create: false, startHandover: false, extend: true })).toBe('Chưa bầu được ban chủ nhiệm mới thì gia hạn nhiệm kỳ.')
    expect(overdueHintText({ create: false, startHandover: false, extend: false })).toBeNull()
  })
})
