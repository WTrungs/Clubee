import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import type { Handover, HandoverItem, HandoverItemKind, ItemConfirmationRequest } from '../model/handoverTypes'
import { termRepository } from '../model/termRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const fields = (error: ApiError | null) => error?.fieldErrors.map((fieldError) => fieldError.field)
const eventName = (id: string) => db.events.find((event) => event.id === id)?.name ?? id
const membership = (userId: string) => {
  const found = db.memberships.find((candidate) => candidate.userId === userId && candidate.clubId === 'c-guitar')
  if (!found) throw new Error(`Thiếu tư cách seed của ${userId}`)
  return found
}

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

const list = (handoverId: string, kind?: HandoverItemKind) => termRepository.items('c-guitar', handoverId, { kind, size: 200 }).then((page) => page.content)
const byTitle = (items: HandoverItem[], title: string) => {
  const found = items.find((item) => item.title === title)
  if (!found) throw new Error(`Không thấy mục ${title}`)
  return found
}
const confirm = (handoverId: string, items: ItemConfirmationRequest[]) => termRepository.confirmItems('c-guitar', handoverId, { items })

describe('handover catalog (FR-TERM-04)', () => {
  it('lists open funds, events that are not draft, closed or cancelled, and unfinished department tasks', async () => {
    const handover = await openHandover()

    const funds = await list(handover.id, 'FUND')
    expect(funds[0]).toMatchObject({ title: 'Quỹ chung', status: 'PENDING', fund: { fundKind: 'GENERAL', pendingCount: 2 } })
    expect(funds).toHaveLength(db.funds.filter((fund) => fund.clubId === 'c-guitar' && fund.status === 'OPEN').length)

    const events = await list(handover.id, 'EVENT')
    const titles = events.map((item) => item.title)
    expect(titles).toContain(eventName('e-winter'))
    expect(titles).toContain(eventName('e-busking'))
    expect(titles).not.toContain(eventName('e-camp'))
    expect(titles).not.toContain(eventName('e-acoustic-sep'))
    expect(byTitle(events, eventName('e-winter')).event).toMatchObject({ lead: { id: 'u-bao' }, needsLeadDecision: true, openTaskCount: 3 })
    // Chờ duyệt chưa có Trưởng BTC nên chưa cần quyết định.
    expect(byTitle(events, eventName('e-busking')).event).toMatchObject({ lead: null, needsLeadDecision: false })

    const tasks = await list(handover.id, 'TASK')
    const expected = db.tasks.filter((task) => task.clubId === 'c-guitar' && task.scopeType === 'DEPARTMENT' && task.status !== 'DONE' && task.status !== 'CANCELLED')
    expect(tasks.map((item) => item.title).toSorted()).toEqual(expected.map((task) => task.title).toSorted())
    expect(tasks[0]?.task).toMatchObject({ owner: { id: expect.any(String) }, assigner: { id: expect.any(String) } })

    // Tạm ứng mẫu còn Chờ duyệt nên chưa vào danh mục; tài liệu của nhiệm kỳ cũ gộp thành một mục.
    expect(await list(handover.id, 'ADVANCE')).toHaveLength(0)
    const documents = await list(handover.id, 'DOCUMENTS')
    expect(documents).toEqual([expect.objectContaining({ title: 'Tài liệu Nhiệm kỳ 2026–2027', documents: { termName: 'Nhiệm kỳ 2026–2027', count: 3 } })])

    const fresh = await termRepository.handover('c-guitar', handover.id)
    expect(fresh.counts).toMatchObject({ pending: funds.length + events.length + tasks.length + documents.length, confirmed: 0, resolved: 0 })
    expect(fresh.counts.byKind.EVENT.pending).toBe(events.length)
    expect(fresh.blockers).toContain(`Còn ${fresh.counts.pending} mục bàn giao chờ ban chủ nhiệm mới xác nhận.`)
  })

  it('shows the catalog to the old and new board only, and the progress to every member', async () => {
    const handover = await openHandover()
    signInAs('u-ha')
    expect((await fail(list(handover.id)))?.status).toBe(403)
    const current = (await termRepository.list('c-guitar')).find((term) => term.status === 'HANDING_OVER')
    expect(current?.handoverProgress).toEqual({ pending: handover.counts.pending, confirmed: 0 })

    signInAs('u-anh')
    // Ban chủ nhiệm cũ không xác nhận trực tiếp, chỉ xác nhận thay (FR-TERM-07).
    const asOldBoard = await list(handover.id)
    expect(asOldBoard.every((item) => !item.allowedActions.includes('CONFIRM'))).toBe(true)
    expect(asOldBoard.filter((item) => item.allowedActions.includes('SUBSTITUTE_CONFIRM')).length).toBeGreaterThan(0)
    signInAs('u-linh')
    expect((await termRepository.handover('c-guitar', handover.id)).allowedActions).toEqual(['CONFIRM'])
    expect((await list(handover.id)).every((item) => item.allowedActions.includes('CONFIRM'))).toBe(true)
  })
})

describe('confirming handover items (FR-TERM-05, NFR-REL-03)', () => {
  it('lets only eligible new board members confirm, including a re-elected treasurer', async () => {
    const handover = await openHandover()
    const [general] = await list(handover.id, 'FUND')
    if (!general) throw new Error('Thiếu Quỹ chung')

    for (const outsider of ['u-ha', 'u-anh']) {
      signInAs(outsider)
      expect((await fail(confirm(handover.id, [{ itemId: general.id, version: general.version }])))?.status).toBe(403)
    }
    signInAs('u-mai')
    const saved = await confirm(handover.id, [{ itemId: general.id, version: general.version }])
    expect(saved.version).toBe(handover.version + 1)
    expect(saved.counts.byKind.FUND.confirmed).toBe(1)
    expect(byTitle(await list(handover.id, 'FUND'), 'Quỹ chung')).toMatchObject({ status: 'CONFIRMED', confirmedBy: { id: 'u-mai' }, note: null })

    // Người được bầu không còn Chính thức (vẫn là thành viên) thì mất quyền xác nhận.
    const other = (await list(handover.id, 'FUND')).find((item) => item.status === 'PENDING')
    if (!other) throw new Error('Thiếu quỹ sự kiện')
    membership('u-mai').status = 'ON_LEAVE'
    expect((await fail(confirm(handover.id, [{ itemId: other.id, version: other.version }])))?.status).toBe(403)
    expect((await termRepository.handover('c-guitar', handover.id)).allowedActions).toEqual([])
  })

  it('confirms all or nothing: one stale item fails the whole batch with 409', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const tasks = await list(handover.id, 'TASK')
    const [first, second] = tasks
    if (!first || !second) throw new Error('Cần ít nhất 2 việc')
    await confirm(handover.id, [{ itemId: first.id, version: first.version }])

    const conflict = await fail(
      confirm(handover.id, [
        { itemId: second.id, version: second.version },
        { itemId: first.id, version: first.version },
      ]),
    )
    expect(conflict).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' })
    expect(fields(conflict)).toEqual(['items[1]'])
    expect(byTitle(await list(handover.id, 'TASK'), second.title).status).toBe('PENDING')
  })

  it('sends a confirmed fund back to pending with a note when its balance or pending requests change', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const [general] = await list(handover.id, 'FUND')
    if (!general?.fund) throw new Error('Thiếu Quỹ chung')
    await confirm(handover.id, [{ itemId: general.id, version: general.version }])

    // Thủ quỹ ghi sổ khoản chi đã duyệt: số dư giảm.
    const approved = db.transactions.find((transaction) => transaction.fundId === 'fund-c-guitar' && transaction.status === 'APPROVED')
    if (!approved) throw new Error('Thiếu khoản Đã duyệt trong seed')
    approved.status = 'POSTED'
    const drifted = byTitle(await list(handover.id, 'FUND'), 'Quỹ chung')
    expect(drifted).toMatchObject({ status: 'PENDING', confirmedBy: null, version: general.version + 2 })
    expect(drifted?.note).toMatch(/^Số dư đổi từ .+ đ thành .+ đ sau khi xác nhận\.$/)

    // Khoản chờ bớt đi (bị từ chối) thì không cần xác nhận lại; có khoản chờ mới thì cần.
    await confirm(handover.id, [{ itemId: drifted.id, version: drifted.version }])
    const proposed = db.transactions.find((transaction) => transaction.fundId === 'fund-c-guitar' && transaction.status === 'PROPOSED')
    if (!proposed) throw new Error('Thiếu khoản chờ duyệt trong seed')
    proposed.status = 'REJECTED'
    expect(byTitle(await list(handover.id, 'FUND'), 'Quỹ chung')).toMatchObject({ status: 'CONFIRMED', fund: { pendingCount: 0 } })
    db.transactions.push({ ...approved, id: 'tx-new-proposal', status: 'PROPOSED', posterId: null, postedAt: null, occurredOn: null })
    const again = byTitle(await list(handover.id, 'FUND'), 'Quỹ chung')
    expect(again).toMatchObject({ status: 'PENDING', note: 'Có thêm 1 khoản chờ duyệt hoặc chờ ghi sổ sau khi xác nhận.' })
  })

  it('bumps the version of a pending item when its numbers change, so a confirmation made on old numbers gets 409', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const [general] = await list(handover.id, 'FUND')
    if (!general) throw new Error('Thiếu Quỹ chung')
    const approved = db.transactions.find((transaction) => transaction.fundId === 'fund-c-guitar' && transaction.status === 'APPROVED')
    if (approved) approved.status = 'POSTED'
    expect((await fail(confirm(handover.id, [{ itemId: general.id, version: general.version }])))?.status).toBe(409)
  })

  it('marks a task as no longer needing handover once it is done, without counting it as confirmed', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const [task] = await list(handover.id, 'TASK')
    if (!task) throw new Error('Thiếu việc')
    const record = db.tasks.find((candidate) => candidate.title === task.title)
    if (!record) throw new Error('Thiếu bản ghi việc')
    record.status = 'DONE'

    const resolved = byTitle(await list(handover.id, 'TASK'), task.title)
    expect(resolved).toMatchObject({ status: 'RESOLVED', note: 'Công việc đã hoàn thành nên không cần bàn giao nữa.', confirmedBy: null, allowedActions: [] })
    const fresh = await termRepository.handover('c-guitar', handover.id)
    expect(fresh.counts.byKind.TASK).toMatchObject({ resolved: 1, confirmed: 0 })
    expect((await fail(confirm(handover.id, [{ itemId: task.id, version: task.version }])))?.status).toBe(409)
    expect(await fail(confirm(handover.id, [{ itemId: resolved.id, version: resolved.version }]))).toMatchObject({ status: 422, code: 'ITEM_NOT_CONFIRMABLE' })
  })

  it('requires a keep-or-replace decision for running events and validates the replacement (BR-ORG-01)', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const events = await list(handover.id, 'EVENT')
    const winter = byTitle(events, eventName('e-winter'))
    const livestream = byTitle(events, eventName('e-livestream'))
    const busking = byTitle(events, eventName('e-busking'))

    expect(fields(await fail(confirm(handover.id, [{ itemId: winter.id, version: winter.version }])))).toEqual(['items[0].eventLead'])
    const outsider = await fail(confirm(handover.id, [{ itemId: livestream.id, version: livestream.version, eventLead: { action: 'REPLACE', userId: 'u-tu' } }]))
    expect(fields(outsider)).toEqual(['items[0].eventLead.userId'])
    const onLeave = await fail(confirm(handover.id, [{ itemId: livestream.id, version: livestream.version, eventLead: { action: 'REPLACE', userId: 'u-yen' } }]))
    expect(onLeave?.status).toBe(400)
    expect(fields(await fail(confirm(handover.id, [{ itemId: busking.id, version: busking.version, eventLead: { action: 'KEEP' } }])))).toEqual(['items[0].eventLead'])

    await confirm(handover.id, [
      { itemId: winter.id, version: winter.version, eventLead: { action: 'KEEP' } },
      { itemId: livestream.id, version: livestream.version, eventLead: { action: 'REPLACE', userId: 'u-tram' } },
      { itemId: busking.id, version: busking.version },
    ])
    const after = await list(handover.id, 'EVENT')
    expect(byTitle(after, eventName('e-winter'))).toMatchObject({ status: 'CONFIRMED', eventLead: { action: 'KEEP', person: { id: 'u-bao' } }, allowedActions: ['CONFIRM'] })
    expect(byTitle(after, eventName('e-livestream')).eventLead).toEqual({ action: 'REPLACE', person: expect.objectContaining({ id: 'u-tram' }) })
    expect(byTitle(after, eventName('e-busking')).allowedActions).toEqual([])
    // Quyết định chỉ áp dụng khi hoàn tất (BR-TERM-02): Trưởng BTC hiện tại vẫn giữ chức.
    expect(byTitle(after, eventName('e-livestream')).event?.lead?.id).toBe('u-kiet')

    // Chọn đúng Trưởng BTC hiện tại thì coi như giữ.
    const winterNow = byTitle(after, eventName('e-winter'))
    await confirm(handover.id, [{ itemId: winterNow.id, version: winterNow.version, eventLead: { action: 'REPLACE', userId: 'u-bao' } }])
    expect(byTitle(await list(handover.id, 'EVENT'), eventName('e-winter')).eventLead?.action).toBe('KEEP')
  })

  it('reopens an event item when the chosen replacement or the kept lead is no longer valid', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const events = await list(handover.id, 'EVENT')
    const winter = byTitle(events, eventName('e-winter'))
    const livestream = byTitle(events, eventName('e-livestream'))
    await confirm(handover.id, [
      { itemId: winter.id, version: winter.version, eventLead: { action: 'KEEP' } },
      { itemId: livestream.id, version: livestream.version, eventLead: { action: 'REPLACE', userId: 'u-tram' } },
    ])

    membership('u-tram').status = 'LEFT'
    membership('u-bao').status = 'LEFT'
    const after = await list(handover.id, 'EVENT')
    expect(byTitle(after, eventName('e-livestream'))).toMatchObject({ status: 'PENDING', eventLead: null, note: expect.stringMatching(/không còn đủ điều kiện làm Trưởng BTC nên cần chọn lại\.$/) })
    expect(byTitle(after, eventName('e-winter'))).toMatchObject({ status: 'PENDING', event: { lead: null }, note: expect.stringMatching(/không còn là Trưởng BTC sau khi xác nhận\.$/) })
    const reopened = byTitle(after, eventName('e-winter'))
    expect(fields(await fail(confirm(handover.id, [{ itemId: reopened.id, version: reopened.version, eventLead: { action: 'KEEP' } }])))).toEqual(['items[0].eventLead'])
  })

  it('clears the pending-items blocker once every item is confirmed', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    const items = await list(handover.id)
    const requests: ItemConfirmationRequest[] = items.map((item) => ({
      itemId: item.id,
      version: item.version,
      ...(item.event?.needsLeadDecision ? { eventLead: { action: 'KEEP' as const } } : {}),
    }))
    const saved = await confirm(handover.id, requests)
    expect(saved.counts).toMatchObject({ pending: 0, confirmed: items.length })
    expect(saved.blockers.some((blocker) => blocker.includes('mục bàn giao'))).toBe(false)
    expect((await termRepository.list('c-guitar')).find((term) => term.status === 'HANDING_OVER')?.handoverProgress).toEqual({ pending: 0, confirmed: items.length })
  })

  it('rejects empty or foreign confirmations with 400', async () => {
    const handover = await openHandover()
    signInAs('u-linh')
    expect((await fail(confirm(handover.id, [])))?.status).toBe(400)
    expect(fields(await fail(confirm(handover.id, [{ itemId: 'nothing', version: 1 }])))).toEqual(['items[0].itemId'])
    expect((await fail(termRepository.items('c-guitar', handover.id, { kind: 'ASSET' as HandoverItemKind })))?.status).toBe(400)
  })
})
