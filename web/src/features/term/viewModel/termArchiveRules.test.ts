import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { fundBalance } from '@/api/mocks/mockFinance'
import { vnDate } from '@/api/mocks/mockTime'
import { eventRepository } from '@/features/event/model/eventRepository'
import { signInAs } from '@/testUtils'
import { termRepository } from '../model/termRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
/** Thêm giao dịch Quỹ chung Guitar dựa trên một dòng mẫu; mặc định Đã ghi sổ. */
function addGeneralTransaction(fields: Partial<(typeof db.transactions)[number]> & { id: string; occurredOn: string; amount: number }) {
  const template = db.transactions.find((transaction) => transaction.id === 'tx-dues-s1')
  if (!template) throw new Error('Thiếu giao dịch seed')
  db.transactions.push({ ...template, status: 'POSTED', targetFundId: null, ...fields })
}

const termOf = (id: string) => {
  const found = db.terms.find((term) => term.id === id)
  if (!found) throw new Error(`Thiếu nhiệm kỳ ${id}`)
  return found
}

describe('looking up a past term (FR-TERM-08, BR-DATA-02)', () => {
  it('names departments as they were when the term closed, with the board and heads of that term', async () => {
    signInAs('u-ha')
    const overview = await termRepository.overview('c-guitar', 't-guitar-2025')
    expect(overview.term).toMatchObject({ id: 't-guitar-2025', status: 'CLOSED' })
    expect(overview.departments.map((department) => department.name)).toEqual(['Truyền thông và Sự kiện', 'Hậu cần', 'Chuyên môn'])
    expect(overview.board.map((holder) => [holder.role, holder.person.id])).toEqual([
      ['PRESIDENT', 'u-anh'],
      ['VICE_PRESIDENT', 'u-huy'],
      ['TREASURER', 'u-mai'],
    ])
    const media = overview.departments.find((department) => department.id === 'd-media')
    // Trưởng ban trước, kể cả người đã rời CLB và chức bị thu hồi sớm.
    expect(media?.holders.map((holder) => [holder.role, holder.person.id, holder.revoked])).toEqual([
      ['DEPARTMENT_HEAD', 'u-linh', false],
      ['DEPARTMENT_VICE_HEAD', 'u-phuong', true],
    ])
  })

  it('shows the running term with the current department names', async () => {
    signInAs('u-ha')
    const overview = await termRepository.overview('c-guitar', 't-guitar-2026')
    expect(overview.departments.map((department) => department.name)).toContain('Truyền thông')
    expect(overview.board.find((holder) => holder.role === 'PRESIDENT')).toMatchObject({ person: { id: 'u-anh' }, startOn: termOf('t-guitar-2026').startOn })
  })

  it('carries the general fund balance from one term to the next', async () => {
    const general = db.transactions.find((transaction) => transaction.id === 'tx-dues-s1')?.fundId ?? ''
    const winterFund = db.funds.find((fund) => fund.kind === 'EVENT' && fund.eventId === 'e-winter')?.id ?? ''
    addGeneralTransaction({ id: 'tx-before', direction: 'IN', type: 'INCOME', amount: 1_000_000, occurredOn: vnDate(-500) })
    addGeneralTransaction({ id: 'tx-old-in', direction: 'IN', type: 'INCOME', amount: 2_000_000, occurredOn: vnDate(-200) })
    addGeneralTransaction({ id: 'tx-old-out', direction: 'OUT', type: 'EXPENSE', amount: 300_000, occurredOn: vnDate(-100) })
    // Chuyển từ quỹ sự kiện sang Quỹ chung là tiền vào của Quỹ chung.
    addGeneralTransaction({ id: 'tx-old-transfer', fundId: winterFund, targetFundId: general, direction: 'OUT', type: 'TRANSFER', amount: 400_000, occurredOn: vnDate(-150) })
    addGeneralTransaction({ id: 'tx-old-proposed', direction: 'OUT', type: 'EXPENSE', status: 'PROPOSED', amount: 999_000, occurredOn: vnDate(-120) })
    // Ngày cuối nhiệm kỳ cũ vẫn thuộc nhiệm kỳ cũ.
    addGeneralTransaction({ id: 'tx-last-day', direction: 'OUT', type: 'EXPENSE', amount: 100_000, occurredOn: termOf('t-guitar-2025').endOn })

    signInAs('u-ha')
    const last = (await termRepository.overview('c-guitar', 't-guitar-2025')).generalFund
    const current = (await termRepository.overview('c-guitar', 't-guitar-2026')).generalFund
    expect(last).toEqual({ fundId: general, openingBalance: 1_000_000, income: 2_400_000, expense: 400_000, closingBalance: 3_000_000 })
    // Hai nhiệm kỳ liền nhau nên số dư cuối kỳ trước là số dư đầu kỳ sau.
    expect(current?.openingBalance).toBe(3_000_000)
    expect(current?.closingBalance).toBe(fundBalance(general))
  })

  it('lists only the events that start within the term', async () => {
    signInAs('u-anh')
    const current = termOf('t-guitar-2026')
    const page = await eventRepository.list('c-guitar', { termId: current.id, size: 200 })
    expect(page.content.length).toBeGreaterThan(0)
    expect(page.content.every((event) => event.startAt.slice(0, 10) >= current.startOn && event.startAt.slice(0, 10) <= current.endOn)).toBe(true)
    db.events.push({ ...(db.events.find((event) => event.id === 'e-exchange') ?? db.events[0]!), id: 'e-old', name: 'Đêm nhạc năm ngoái', startAt: `${vnDate(-200)}T19:00:00+07:00`, endAt: `${vnDate(-200)}T21:00:00+07:00` })
    expect((await eventRepository.list('c-guitar', { termId: 't-guitar-2025', size: 200 })).content.map((event) => event.id)).toContain('e-old')
    expect((await eventRepository.list('c-guitar', { termId: current.id, size: 200 })).content.map((event) => event.id)).not.toContain('e-old')
    expect(await fail(eventRepository.list('c-guitar', { termId: 't-english-2026' }))).toMatchObject({ status: 400 })
  })

  it('is open to every member only, and only once the term has started', async () => {
    signInAs('u-tu')
    expect(await fail(termRepository.overview('c-guitar', 't-guitar-2025'))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    expect(await fail(termRepository.overview('c-guitar', 't-english-2026'))).toMatchObject({ status: 404 })
    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    expect(await fail(termRepository.overview('c-guitar', next.id))).toMatchObject({ status: 422, code: 'TERM_NOT_STARTED' })
  })

  it('has departments that exist before any position held in them (seed, BR-ORG-01)', () => {
    const early = db.positions.flatMap((position) => {
      const department = db.departments.find((candidate) => candidate.id === position.scopeId)
      return department && position.startOn < department.createdAt.slice(0, 10) ? [`${position.id} ${position.startOn} < ${department.createdAt}`] : []
    })
    expect(early).toEqual([])
  })
})
