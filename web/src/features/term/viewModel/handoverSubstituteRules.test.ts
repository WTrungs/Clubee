import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { notificationRepository } from '@/features/notification/model/notificationRepository'
import { signInAs } from '@/testUtils'
import type { Handover, HandoverItem, HandoverItemKind } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const list = (handoverId: string, kind?: HandoverItemKind) => termRepository.items('c-guitar', handoverId, { kind, size: 200 }).then((page) => page.content)
const only = async (handoverId: string, kind: HandoverItemKind): Promise<HandoverItem> => {
  const [item] = await list(handoverId, kind)
  if (!item) throw new Error(`Thiếu mục ${kind}`)
  return item
}
const entry = (item: HandoverItem) => ({ itemId: item.id, version: item.version })
const substitute = (handoverId: string, items: HandoverItem[], reason = 'Thủ quỹ cũ đã rời CLB, không liên lạc được.') =>
  termRepository.substituteConfirm('c-guitar', handoverId, { items: items.map(entry), reason })

/** Ban chủ nhiệm u-anh mở bàn giao; ban chủ nhiệm mới gồm u-linh (Chủ nhiệm) và u-mai tái đắc cử Thủ quỹ. */
async function openHandover(): Promise<Handover> {
  signInAs('u-anh')
  const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
  const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
  return termRepository.saveAppointments('c-guitar', started.id, {
    appointments: [
      { role: 'PRESIDENT', departmentId: null, userId: 'u-linh' },
      { role: 'TREASURER', departmentId: null, userId: 'u-mai' },
    ],
    version: started.version,
  })
}

const advance = () => {
  const found = db.advances.find((candidate) => candidate.id === 'adv-strings')
  if (!found) throw new Error('Thiếu tạm ứng seed')
  return found
}

describe('advance and document handover items (FR-TERM-04)', () => {
  it('lists an advance not yet settled with what is left, and asks again when it moves on', async () => {
    Object.assign(advance(), { status: 'DISBURSED', disbursedOn: vnDate(-3) })
    const handover = await openHandover()
    const item = await only(handover.id, 'ADVANCE')
    expect(item).toMatchObject({ title: advance().purpose, status: 'PENDING', advance: { status: 'DISBURSED', outstanding: advance().amount, requester: { id: advance().requesterId } } })

    signInAs('u-linh')
    await termRepository.confirmItems('c-guitar', handover.id, { items: [entry(item)] })
    advance().status = 'PARTIALLY_SETTLED'
    expect(await only(handover.id, 'ADVANCE')).toMatchObject({ status: 'PENDING', note: 'Tạm ứng chuyển từ Đã ứng sang Quyết toán một phần sau khi xác nhận.' })

    advance().status = 'SETTLED'
    expect(await only(handover.id, 'ADVANCE')).toMatchObject({ status: 'RESOLVED', note: 'Tạm ứng đã quyết toán xong nên không cần bàn giao nữa.' })
  })

  it('groups the old term documents in one item that must be confirmed again when the count changes', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const item = await only(handover.id, 'DOCUMENTS')
    await termRepository.confirmItems('c-guitar', handover.id, { items: [entry(item)] })
    const template = db.documents.find((document) => document.id === 'doc-rules')
    if (!template) throw new Error('Thiếu tài liệu seed')
    db.documents.push({ ...template, id: 'doc-extra', title: 'Biên bản họp cuối nhiệm kỳ' })
    expect(await only(handover.id, 'DOCUMENTS')).toMatchObject({ status: 'PENDING', documents: { count: 4 }, note: 'Số tài liệu đổi từ 3 thành 4 sau khi xác nhận.' })

    db.documents = db.documents.filter((document) => document.termId !== 't-guitar-2026')
    expect(await only(handover.id, 'DOCUMENTS')).toMatchObject({ status: 'RESOLVED' })
  })
})

describe('substitute confirmation (FR-TERM-07, BR-TERM-03)', () => {
  it('lets the current board confirm pending items for the old holders, which unlocks completion', async () => {
    const handover = await openHandover()
    signInAs('u-anh')
    const pending = (await list(handover.id)).filter((item) => item.status === 'PENDING')
    expect(pending.every((item) => item.allowedActions.includes('SUBSTITUTE_CONFIRM'))).toBe(true)

    const saved = await substitute(handover.id, pending)
    expect(saved.counts.pending).toBe(0)
    expect(saved.blockers.some((blocker) => blocker.includes('mục bàn giao chờ'))).toBe(false)
    const winter = (await list(handover.id, 'EVENT')).find((item) => item.event?.lead?.id === 'u-bao')
    expect(winter).toMatchObject({
      status: 'CONFIRMED',
      confirmedBy: { id: 'u-anh' },
      substitute: { by: { id: 'u-anh' }, reason: 'Thủ quỹ cũ đã rời CLB, không liên lạc được.' },
      eventLead: { action: 'KEEP', person: { id: 'u-bao' } },
    })
    expect(db.auditLogs.filter((log) => log.action === 'HANDOVER_SUBSTITUTE_CONFIRM')).toHaveLength(pending.length)

    signInAs('u-linh')
    expect((await notificationRepository.list({ category: 'TERM' })).content.map((notification) => notification.title)).toContain(`${pending.length} mục bàn giao được xác nhận thay`)
    // Người được bầu xác nhận lại trực tiếp thì nhãn xác nhận thay biến mất.
    const fund = await only(handover.id, 'FUND')
    expect(fund.allowedActions).toEqual([])

    signInAs('u-anh')
    const fresh = await termRepository.handover('c-guitar', handover.id)
    await expect(termRepository.complete('c-guitar', handover.id, { action: 'COMPLETE', version: fresh.version })).resolves.toMatchObject({ status: 'COMPLETED' })
  })

  it('is closed to the elected board, who confirm directly, and to ordinary members', async () => {
    const handover = await openHandover()
    signInAs('u-anh')
    const [first] = await list(handover.id, 'FUND')
    if (!first) throw new Error('Thiếu Quỹ chung')
    for (const userId of ['u-linh', 'u-mai', 'u-ha']) {
      signInAs(userId)
      expect(await fail(substitute(handover.id, [first], ''))).toMatchObject({ status: 403 })
      if (userId !== 'u-ha') expect((await termRepository.handover('c-guitar', handover.id)).allowedActions).not.toContain('SUBSTITUTE_CONFIRM')
    }
  })

  it('checks version, then item status, then the reason', async () => {
    const handover = await openHandover()
    signInAs('u-anh')
    const [general] = await list(handover.id, 'FUND')
    const documents = await only(handover.id, 'DOCUMENTS')
    if (!general) throw new Error('Thiếu Quỹ chung')
    expect(await fail(termRepository.substituteConfirm('c-guitar', handover.id, { items: [{ itemId: general.id, version: general.version + 1 }], reason: '' }))).toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
    })
    await substitute(handover.id, [documents])
    const confirmed = await only(handover.id, 'DOCUMENTS')
    expect(confirmed.allowedActions).toEqual([])
    const twice = await fail(substitute(handover.id, [confirmed], ''))
    expect(twice).toMatchObject({ status: 422, code: 'ITEM_NOT_CONFIRMABLE' })
    expect(twice?.fieldErrors[0]?.message).toContain('đã được xác nhận')

    const invalid = await fail(substitute(handover.id, [general], 'ngắn'))
    expect(invalid).toMatchObject({ status: 400 })
    expect(fields(invalid)).toEqual(['reason'])
    expect(fields(await fail(termRepository.substituteConfirm('c-guitar', handover.id, { items: [], reason: 'Người cũ không bàn giao.' })))).toEqual(['items'])
  })

  it('leaves an event that needs a lead decision but has no lead to the new board', async () => {
    const handover = await openHandover()
    const lead = db.positions.find((position) => position.role === 'EVENT_LEAD' && position.scopeId === 'e-winter')
    if (lead) Object.assign(lead, { revokedAt: vnDate(-1), endOn: vnDate(-1) })
    signInAs('u-anh')
    const winter = (await list(handover.id, 'EVENT')).find((item) => item.title === db.events.find((event) => event.id === 'e-winter')?.name)
    if (!winter) throw new Error('Thiếu sự kiện Đêm nhạc')
    expect(winter.allowedActions).not.toContain('SUBSTITUTE_CONFIRM')
    const error = await fail(substitute(handover.id, [winter]))
    expect(error).toMatchObject({ status: 422, code: 'ITEM_NOT_CONFIRMABLE' })
    expect(error?.fieldErrors[0]?.message).toContain('chưa có Trưởng BTC')
  })
})
