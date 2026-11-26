import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { vnDate, vnToday } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { duesRepository } from '../model/duesRepository'
import type { MyDuesItem } from '../model/duesTypes'
import { useFinancePageViewModel } from './useFinancePageViewModel'
import { myDuesSummary, myExemptionText, useMyDuesViewModel } from './useMyDuesViewModel'

const CAMPAIGN = 'dues-guitar-hk1'
const campaign = () => {
  const found = db.duesCampaigns.find((candidate) => candidate.id === CAMPAIGN)
  if (!found) throw new Error('Thiếu đợt seed')
  return found
}
const itemOf = (userId: string) => {
  const found = db.duesItems.find((item) => item.campaignId === CAMPAIGN && item.userId === userId)
  if (!found) throw new Error(`Thiếu dòng của ${userId}`)
  return found
}
const pay = async (userId: string, amount: number) => {
  signInAs('u-mai')
  const item = itemOf(userId)
  await duesRepository.recordPayment('c-guitar', CAMPAIGN, item.id, { amount, paidOn: vnToday(), version: item.version })
}

describe('khoản đóng của tôi (FR-FIN-13)', () => {
  it('chỉ trả dòng của chính người gọi, kể cả khi không có quyền xem đợt', async () => {
    signInAs('u-ha')
    const [mine, ...rest] = await duesRepository.mine('c-guitar')
    expect(rest).toHaveLength(0)
    expect(mine).toMatchObject({ campaign: { id: CAMPAIGN, name: 'Quỹ học kỳ 1', status: 'OPEN' }, amountDue: 100_000, paidAmount: 0, remaining: 100_000, status: 'UNPAID', overdue: false })
    expect(await duesRepository.mine('c-english')).toEqual([])
  })

  it('cập nhật số đã nộp, còn thiếu và các lần nộp sau khi Thủ quỹ xác nhận', async () => {
    await pay('u-ha', 40_000)
    signInAs('u-ha')
    const [mine] = await duesRepository.mine('c-guitar')
    expect(mine).toMatchObject({ paidAmount: 40_000, remaining: 60_000, status: 'PARTIAL', payments: [{ amount: 40_000, confirmedBy: { fullName: 'Võ Ngọc Mai' }, transactionId: expect.any(String) }] })
  })

  it('báo quá hạn khi đợt còn mở đã qua hạn mà còn thiếu; đợt đã đóng thì không', async () => {
    campaign().dueOn = vnDate(-1)
    signInAs('u-ha')
    expect((await duesRepository.mine('c-guitar'))[0]?.overdue).toBe(true)
    campaign().status = 'CLOSED'
    expect((await duesRepository.mine('c-guitar'))[0]?.overdue).toBe(false)
  })

  it('nêu miễn giảm kèm lý do của chính mình', async () => {
    Object.assign(itemOf('u-ha'), { amountDue: 50_000, exemption: { kind: 'REDUCED', reason: 'Hoàn cảnh khó khăn', by: 'u-mai', at: '2026-11-01T09:00:00+07:00' } })
    signInAs('u-ha')
    const [mine] = await duesRepository.mine('c-guitar')
    expect(mine?.exemption).toEqual({ kind: 'REDUCED', reason: 'Hoàn cảnh khó khăn' })
    expect(mine && myExemptionText(mine)).toBe('Bạn được giảm còn 50.000 đ (mức đóng 100.000 đ)')
  })
})

describe('myDuesSummary', () => {
  const row = (patch: Partial<MyDuesItem> & { status?: MyDuesItem['status'] }, campaignStatus: 'OPEN' | 'CLOSED' = 'OPEN'): MyDuesItem => ({
    id: crypto.randomUUID(),
    campaign: { id: 'c', clubId: 'c-guitar', clubName: '', name: '', amount: 100_000, dueOn: '2026-12-01', status: campaignStatus },
    amountDue: 100_000,
    paidAmount: 0,
    remaining: 100_000,
    status: 'UNPAID',
    overdue: false,
    exemption: null,
    payments: [],
    ...patch,
  })

  it('chỉ cộng số còn thiếu của đợt đang mở', () => {
    expect(myDuesSummary([row({ remaining: 60_000, overdue: true }), row({ remaining: 100_000 }), row({ remaining: 30_000 }, 'CLOSED'), row({ remaining: 0, status: 'PAID' })])).toEqual({
      owed: 160_000,
      openCount: 2,
      overdueCount: 1,
    })
    expect(myDuesSummary([])).toEqual({ owed: 0, openCount: 0, overdueCount: 0 })
  })
})

describe('tab Khoản đóng của tôi', () => {
  async function clubWrapper(path: string) {
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper(path)
    return ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
  }

  it('thành viên mở thông báo đóng quỹ thì vào tab của mình, làm nổi đúng đợt', async () => {
    signInAs('u-ha')
    const page = renderHook(() => useFinancePageViewModel(), { wrapper: await clubWrapper(`/clubs/c-guitar/finance?view=dues&dues=${CAMPAIGN}`) })
    expect(page.result.current.view).toBe('mine')
    expect(page.result.current.highlightDuesId).toBe(CAMPAIGN)

    const panel = renderHook(() => useMyDuesViewModel('c-guitar', true, CAMPAIGN), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(panel.result.current.items).toHaveLength(1))
    expect(panel.result.current.highlightId).toBe(CAMPAIGN)
    expect(panel.result.current.summary.owed).toBe(100_000)
  })

  it('không làm nổi đợt mình không có dòng', async () => {
    signInAs('u-ha')
    const panel = renderHook(() => useMyDuesViewModel('c-guitar', true, 'dues-khac'), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(panel.result.current.loading).toBe(false))
    expect(panel.result.current.highlightId).toBeNull()
  })
})
