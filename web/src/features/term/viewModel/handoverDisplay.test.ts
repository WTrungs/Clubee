import { describe, expect, it } from 'vitest'
import type { HandoverItem } from '../model/handoverTypes'
import {
  batchConfirmable,
  completionSummary,
  conflictNotice,
  confirmedToast,
  eventLeadText,
  handoverItemStatusDisplay,
  parseItemKind,
  parseItemStatus,
  progressText,
  statusFilterCount,
  statusFilterLabel,
} from './handoverDisplay'

const item = (overrides: Partial<HandoverItem>): HandoverItem => ({
  id: 'hi',
  kind: 'TASK',
  status: 'PENDING',
  title: 'Việc',
  fund: null,
  task: null,
  event: null,
  eventLead: null,
  note: null,
  confirmedBy: null,
  confirmedAt: null,
  allowedActions: ['CONFIRM'],
  version: 1,
  ...overrides,
})

const runningEvent = { status: 'ONGOING' as const, startAt: '2026-11-20T18:00:00+07:00', endAt: '2026-11-20T21:00:00+07:00', lead: null, openTaskCount: 0, needsLeadDecision: true }

describe('handover item labels (FR-TERM-04)', () => {
  it('labels every status with a word, not only a color', () => {
    expect(Object.values(handoverItemStatusDisplay).map((display) => display.label)).toEqual(['Chờ xác nhận', 'Đã xác nhận', 'Không cần bàn giao'])
    expect(statusFilterLabel('')).toBe('Tất cả')
  })

  it('reads kind and status from the URL, falling back to funds and all statuses', () => {
    expect(parseItemKind('TASK')).toBe('TASK')
    expect(parseItemKind('ASSET')).toBe('FUND')
    expect(parseItemKind(null)).toBe('FUND')
    expect(parseItemStatus('RESOLVED')).toBe('RESOLVED')
    expect(parseItemStatus('nope')).toBe('')
  })

  it('counts each filter and leaves resolved items out of the progress', () => {
    const counts = { total: 6, pending: 2, confirmed: 3, resolved: 1 }
    expect([statusFilterCount(counts, ''), statusFilterCount(counts, 'PENDING'), statusFilterCount(counts, 'CONFIRMED'), statusFilterCount(counts, 'RESOLVED')]).toEqual([6, 2, 3, 1])
    expect(progressText({ pending: 2, confirmed: 3 })).toBe('Đã xác nhận 3/5 mục bàn giao, còn 2 mục chờ.')
    expect(progressText({ pending: 0, confirmed: 5 })).toBe('Đã xác nhận đủ 5 mục bàn giao.')
    expect(progressText({ pending: 0, confirmed: 0 })).toBe('Chưa có mục nào cần bàn giao.')
  })

  it('describes the event lead decision', () => {
    expect(eventLeadText({ action: 'KEEP', person: { id: 'u-bao', fullName: 'Trần Gia Bảo' } })).toBe('Giữ Trưởng BTC Trần Gia Bảo')
    expect(eventLeadText({ action: 'REPLACE', person: { id: 'u-tram', fullName: 'Phạm Ngọc Trâm' } })).toBe('Thay Trưởng BTC bằng Phạm Ngọc Trâm')
  })

  it('sends only pending items without a lead decision in a batch', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', status: 'CONFIRMED' }),
      item({ id: 'c', kind: 'EVENT', event: runningEvent }),
      item({ id: 'd', allowedActions: [] }),
      item({ id: 'e', kind: 'EVENT', event: { ...runningEvent, needsLeadDecision: false } }),
    ]
    expect(batchConfirmable(items).map((candidate) => candidate.id)).toEqual(['a', 'e'])
  })

  it('summarises what completing the handover changes (FR-TERM-06)', () => {
    const terms = { fromTerm: { id: 'a', name: 'Nhiệm kỳ 2026–2027', startOn: '2026-09-11', endOn: '2027-09-10', status: 'HANDING_OVER' as const }, toTerm: { id: 'b', name: 'Nhiệm kỳ 2027–2028', startOn: '2027-09-01', endOn: '2028-08-31', status: 'PREPARING' as const } }
    const preview = {
      endingPositionCount: 6,
      grantedPositionCount: 3,
      closingDepartments: ['Thiết kế'],
      newDepartments: ['Sự kiện'],
      renamedDepartments: [{ from: 'Truyền thông', to: 'Truyền thông số' }],
      leadReplacements: [{ eventName: 'Livestream', from: { id: 'u-kiet', fullName: 'Lý Tuấn Kiệt' }, to: { id: 'u-tram', fullName: 'Ngô Bảo Trâm' } }],
      fromTermEndOn: '2026-11-13',
      toTermStartOn: '2026-11-14',
    }
    expect(completionSummary(terms, preview)).toEqual([
      'Nhiệm kỳ 2026–2027 kết thúc ngày 13/11/2026; Nhiệm kỳ 2027–2028 bắt đầu ngày 14/11/2026.',
      '6 chức vụ thường trực hiện tại kết thúc; 3 chức vụ theo kết quả bầu có hiệu lực từ hôm nay.',
      'Đóng ban Thiết kế.',
      'Tạo ban mới Sự kiện.',
      'Đổi tên ban Truyền thông thành Truyền thông số.',
      'Thay Trưởng BTC Livestream: Lý Tuấn Kiệt thành Ngô Bảo Trâm.',
    ])
    expect(completionSummary(terms, { ...preview, closingDepartments: [], newDepartments: [], renamedDepartments: [], leadReplacements: [] }).slice(2)).toEqual(['Các ban giữ nguyên như hiện tại.'])
  })

  it('words the conflict and success messages by count', () => {
    expect(conflictNotice(2)).toMatch(/^2 mục vừa thay đổi sau khi bạn mở danh mục nên chưa mục nào được xác nhận\./)
    expect(conflictNotice(0)).toMatch(/^Một mục vừa thay đổi/)
    expect(confirmedToast(1)).toBe('Đã xác nhận mục bàn giao.')
    expect(confirmedToast(4)).toBe('Đã xác nhận 4 mục bàn giao.')
  })
})
