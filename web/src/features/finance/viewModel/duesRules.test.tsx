import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { formatDate } from '@/shared/format/formatDate'
import { notificationPath } from '@/features/notification/viewModel/notificationDisplay'
import { createTestWrapper, signInAs } from '@/testUtils'
import { toast } from 'sonner'
import { duesRepository } from '../model/duesRepository'
import type { OpenDuesRequest } from '../model/duesTypes'
import { OpenDuesSheet } from '../view/OpenDuesSheet'
import { duesDueText, duesItemStatusDisplay, duesProgressText } from './duesDisplay'
import { editDuesSchema, exemptionSchema, openDuesSchema } from './duesSchemas'
import { useFinancePageViewModel } from './useFinancePageViewModel'
import { useDuesItemsViewModel } from './useDuesItemsViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const request = (patch: Partial<OpenDuesRequest> = {}): OpenDuesRequest => ({ name: 'Quỹ học kỳ 2', amount: 120_000, dueOn: vnDate(14), exemptions: [], ...patch })
const seeded = () => {
  const found = db.duesCampaigns.find((campaign) => campaign.id === 'dues-guitar-hk1')
  if (!found) throw new Error('Thiếu đợt seed')
  return found
}
async function allItems(campaignId: string) {
  return (await duesRepository.items('c-guitar', campaignId, { size: 100 })).content
}

async function clubWrapper(path = '/clubs/c-guitar/finance?view=dues') {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper(path)
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

describe('who sees and opens dues campaigns (FR-FIN-09, SRS 3.5)', () => {
  it('hides campaigns from ordinary members and lets the president look but not open one', async () => {
    signInAs('u-ha')
    expect(await fail(duesRepository.list('c-guitar', {}))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('VIEW_DUES')

    signInAs('u-anh')
    expect((await duesRepository.list('c-guitar', {})).content.map((campaign) => campaign.id)).toEqual(['dues-guitar-hk1'])
    const president = await clubRepository.getClub('c-guitar')
    expect(president.allowedActions).toContain('VIEW_DUES')
    expect(president.allowedActions).not.toContain('OPEN_DUES')
    expect(await fail(duesRepository.open('c-guitar', request()))).toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect((await duesRepository.get('c-guitar', 'dues-guitar-hk1')).allowedActions).toEqual([])
  })
})

describe('opening a campaign (FR-FIN-09)', () => {
  it('snapshots probation and active members only, with exemptions, and tells who must pay', async () => {
    signInAs('u-mai')
    const opened = await duesRepository.open(
      'c-guitar',
      request({
        exemptions: [
          { userId: 'u-tram', kind: 'EXEMPT', reason: 'Hoàn cảnh khó khăn, ban chủ nhiệm đã thống nhất.' },
          { userId: 'u-thao', kind: 'REDUCED', amount: 60_000, reason: 'Vào CLB giữa kỳ.' },
        ],
      }),
    )
    expect(opened).toMatchObject({ status: 'OPEN', memberCount: 16, settledCount: 1, expectedAmount: 14 * 120_000 + 60_000, collectedAmount: 0 })
    expect(opened.allowedActions).toEqual(['EDIT', 'EDIT_AMOUNT', 'SET_EXEMPTION', 'RECORD_PAYMENT', 'CLOSE'])
    const items = await allItems(opened.id)
    expect(items.some((item) => item.member.id === 'u-yen')).toBe(false)
    expect(items.find((item) => item.member.id === 'u-tram')).toMatchObject({ status: 'EXEMPT', amountDue: 0, exemption: { kind: 'EXEMPT', by: { id: 'u-mai' } } })
    expect(items.find((item) => item.member.id === 'u-thao')).toMatchObject({ status: 'UNPAID', amountDue: 60_000 })

    const notices = db.notifications.filter((notification) => notification.title === 'Đóng quỹ: Quỹ học kỳ 2')
    const recipients = db.notificationRecipients.filter((recipient) => notices.some((notice) => notice.id === recipient.notificationId)).map((recipient) => recipient.userId)
    // 16 người, trừ người được miễn và chính Thủ quỹ vừa mở đợt (không tự báo cho mình).
    expect(recipients).toHaveLength(14)
    expect(recipients).not.toContain('u-tram')
    expect(recipients).not.toContain('u-mai')
    expect(notices.find((notice) => db.notificationRecipients.some((recipient) => recipient.notificationId === notice.id && recipient.userId === 'u-thao'))?.body).toBe(
      `Mức của bạn 60.000 đ, hạn nộp ${formatDate(vnDate(14))}.`,
    )
    expect(notices[0]?.target).toEqual({ type: 'DUES', clubId: 'c-guitar', id: opened.id })
  })

  it('keeps the snapshot when a member joins or is renamed later (BR-DATA-02)', async () => {
    signInAs('u-mai')
    const opened = await duesRepository.open('c-guitar', request())
    const user = db.users.find((candidate) => candidate.id === 'u-long')
    if (user) user.fullName = 'Tên Đã Đổi'
    const yen = db.memberships.find((membership) => membership.userId === 'u-yen' && membership.clubId === 'c-guitar')
    if (yen) yen.status = 'ACTIVE'
    const items = await allItems(opened.id)
    expect(items.some((item) => item.member.fullName === 'Tên Đã Đổi')).toBe(false)
    expect(items.some((item) => item.member.id === 'u-yen')).toBe(false)
  })

  it('checks the name, amount, deadline and every exemption', async () => {
    signInAs('u-mai')
    const fields = async (patch: Partial<OpenDuesRequest>) => (await fail(duesRepository.open('c-guitar', request(patch))))?.fieldErrors.map((fieldError) => fieldError.field)
    expect(await fields({ name: 'ab', amount: 0, dueOn: vnDate(-1) })).toEqual(['name', 'amount', 'dueOn'])
    expect(await fields({ exemptions: [{ userId: 'u-tram', kind: 'EXEMPT', reason: '' }] })).toEqual(['exemptions[0].reason'])
    expect(await fields({ exemptions: [{ userId: 'u-thao', kind: 'REDUCED', amount: 120_000, reason: 'Vào CLB giữa kỳ.' }] })).toEqual(['exemptions[0].amount'])
    expect(await fields({ exemptions: [{ userId: 'u-yen', kind: 'EXEMPT', reason: 'Đang tạm nghỉ.' }] })).toEqual(['exemptions[0].userId'])
  })
})

describe('changing a campaign (FR-FIN-09, BR-FIN-06)', () => {
  it('edits the name and deadline, and the amount only until someone pays', async () => {
    signInAs('u-mai')
    const renamed = await duesRepository.update('c-guitar', 'dues-guitar-hk1', { name: 'Quỹ HK1', amount: 150_000, version: seeded().version })
    expect(renamed).toMatchObject({ name: 'Quỹ HK1', amount: 150_000, expectedAmount: 16 * 150_000 })
    expect((await fail(duesRepository.update('c-guitar', 'dues-guitar-hk1', { name: 'Quỹ HK1 mới', version: 0 })))?.status).toBe(409)

    const item = db.duesItems.find((candidate) => candidate.campaignId === 'dues-guitar-hk1' && candidate.userId === 'u-long')
    item?.payments.push({ id: 'pay-1', amount: 50_000, paidOn: vnDate(0), confirmedBy: 'u-mai', confirmedAt: vnDate(0), transactionId: 'tx-x' })
    expect(await fail(duesRepository.update('c-guitar', 'dues-guitar-hk1', { amount: 200_000, version: seeded().version }))).toMatchObject({ status: 422, code: 'HAS_PAYMENTS' })
    expect((await duesRepository.get('c-guitar', 'dues-guitar-hk1')).allowedActions).not.toContain('EDIT_AMOUNT')
    // Mức sau miễn giảm không thấp hơn số đã nộp.
    const long = (await allItems('dues-guitar-hk1')).find((candidate) => candidate.member.id === 'u-long')
    expect(
      await fail(duesRepository.setExemption('c-guitar', 'dues-guitar-hk1', long?.id ?? '', { kind: 'REDUCED', amount: 30_000, reason: 'Khó khăn tài chính.', version: long?.version ?? 0 })),
    ).toMatchObject({ status: 422, code: 'BELOW_PAID' })
  })

  it('sets and clears an exemption, needing a reason', async () => {
    signInAs('u-mai')
    const vy = (await allItems('dues-guitar-hk1')).find((item) => item.member.id === 'u-vy')
    const noReason = await fail(duesRepository.setExemption('c-guitar', 'dues-guitar-hk1', vy?.id ?? '', { kind: 'EXEMPT', reason: '', version: vy?.version ?? 0 }))
    expect(noReason?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['reason'])
    const exempt = await duesRepository.setExemption('c-guitar', 'dues-guitar-hk1', vy?.id ?? '', { kind: 'EXEMPT', reason: 'Đi thực tập xa cả kỳ.', version: vy?.version ?? 0 })
    expect(exempt).toMatchObject({ status: 'EXEMPT', amountDue: 0 })
    const cleared = await duesRepository.setExemption('c-guitar', 'dues-guitar-hk1', exempt.id, { kind: 'NONE', version: exempt.version })
    expect(cleared).toMatchObject({ status: 'UNPAID', amountDue: 100_000, exemption: null })
  })

  it('renames a campaign past its deadline without moving the deadline', async () => {
    seeded().dueOn = vnDate(-2)
    signInAs('u-mai')
    const renamed = await duesRepository.update('c-guitar', 'dues-guitar-hk1', { name: 'Quỹ học kỳ một', dueOn: vnDate(-2), version: seeded().version })
    expect(renamed).toMatchObject({ name: 'Quỹ học kỳ một', dueOn: vnDate(-2) })
    // Dời sang một ngày khác thì vẫn phải từ hôm nay.
    const moved = await fail(duesRepository.update('c-guitar', 'dues-guitar-hk1', { dueOn: vnDate(-1), version: renamed.version }))
    expect(moved?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['dueOn'])
    const schema = editDuesSchema('2026-11-18', '2026-11-10')
    expect(schema.safeParse({ name: 'Quỹ HK1', dueDate: '10/11/2026', amount: '100.000' }).success).toBe(true)
    expect(schema.safeParse({ name: 'Quỹ HK1', dueDate: '11/11/2026', amount: '100.000' }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['dueDate'])
  })

  it('stops every change once the campaign is closed', async () => {
    signInAs('u-mai')
    const closed = await duesRepository.close('c-guitar', 'dues-guitar-hk1', seeded().version)
    expect(closed).toMatchObject({ status: 'CLOSED', closedBy: { id: 'u-mai' }, allowedActions: [] })
    expect(await fail(duesRepository.update('c-guitar', 'dues-guitar-hk1', { name: 'Quỹ khác', version: closed.version }))).toMatchObject({ status: 422, code: 'CAMPAIGN_CLOSED' })
    expect((await fail(duesRepository.close('c-guitar', 'dues-guitar-hk1', closed.version)))?.code).toBe('CAMPAIGN_CLOSED')
    const item = (await allItems('dues-guitar-hk1'))[0]
    expect((await fail(duesRepository.setExemption('c-guitar', 'dues-guitar-hk1', item?.id ?? '', { kind: 'EXEMPT', reason: 'Đi thực tập xa.', version: item?.version ?? 0 })))?.code).toBe(
      'CAMPAIGN_CLOSED',
    )
  })

  it('filters and searches the people in a campaign', async () => {
    signInAs('u-anh')
    expect((await duesRepository.items('c-guitar', 'dues-guitar-hk1', { status: 'PAID' })).content).toEqual([])
    expect((await duesRepository.items('c-guitar', 'dues-guitar-hk1', { q: 'Ngọc Mai' })).content.map((item) => item.member.id)).toEqual(['u-mai'])
  })
})

describe('reaching the dues tab (FR-FIN-09, BR-SEC-02)', () => {
  it('links a dues notification to the campaign and sends members without access to the general ledger', async () => {
    expect(notificationPath({ type: 'DUES', clubId: 'c-guitar', id: 'dues-guitar-hk1' })).toBe('/clubs/c-guitar/finance?view=dues&dues=dues-guitar-hk1')
    signInAs('u-ha')
    const member = renderHook(() => useFinancePageViewModel(), { wrapper: await clubWrapper() })
    expect(member.result.current.canViewDues).toBe(false)
    expect(member.result.current.view).toBe('general')
    signInAs('u-anh')
    const board = renderHook(() => useFinancePageViewModel(), { wrapper: await clubWrapper() })
    expect(board.result.current.view).toBe('dues')
  })
})

describe('dues display and schemas (FR-FIN-09)', () => {
  it('words progress, amounts and statuses', () => {
    expect(duesProgressText({ settledCount: 3, memberCount: 16, collectedAmount: 300_000, expectedAmount: 1_600_000 })).toBe('3/16 người xong · 300.000 đ / 1.600.000 đ')
    expect(duesDueText({ amountDue: 60_000, exemption: { kind: 'REDUCED', reason: 'x', by: { id: 'u', fullName: 'A' }, at: '' } }, 120_000)).toBe('60.000 đ (giảm từ 120.000 đ)')
    expect(duesDueText({ amountDue: 0, exemption: { kind: 'EXEMPT', reason: 'x', by: { id: 'u', fullName: 'A' }, at: '' } }, 120_000)).toBe('Miễn đóng')
    expect(Object.keys(duesItemStatusDisplay)).toEqual(['UNPAID', 'PARTIAL', 'PAID', 'EXEMPT'])
  })

  it('checks the opening form and an exemption', () => {
    const schema = openDuesSchema('2026-11-18')
    const ok = { name: 'Quỹ HK2', amount: '120.000', dueDate: '30/11/2026', exemptions: [] }
    expect(schema.safeParse(ok).success).toBe(true)
    const paths = (values: object) => schema.safeParse({ ...ok, ...values }).error?.issues.map((issue) => issue.path.join('.')) ?? []
    expect(paths({ dueDate: '17/11/2026' })).toEqual(['dueDate'])
    expect(paths({ exemptions: [{ userId: 'u', fullName: 'A', kind: 'REDUCED', amount: '120.000', reason: 'Vào giữa kỳ' }] })).toEqual(['exemptions.0.amount'])
    expect(paths({ exemptions: [{ userId: 'u', fullName: 'A', kind: 'EXEMPT', amount: '', reason: 'abc' }] })).toEqual(['exemptions.0.reason'])
    expect(exemptionSchema(100_000).safeParse({ kind: 'NONE', amount: '', reason: '' }).success).toBe(true)
    expect(exemptionSchema(100_000).safeParse({ kind: 'REDUCED', amount: '100.000', reason: 'Khó khăn' }).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['amount'])
  })
})

describe('useDuesItemsViewModel (FR-FIN-09)', () => {
  it('reloads after a 409 instead of saving over someone else', async () => {
    signInAs('u-mai')
    const { result } = renderHook(() => useDuesItemsViewModel('dues-guitar-hk1'), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.canClose).toBe(true))
    seeded().version += 1
    act(() => result.current.openClose())
    act(() => result.current.confirmClose())
    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(seeded().status).toBe('OPEN')
    await waitFor(() => expect(result.current.campaign?.version).toBe(seeded().version))
  })

  it('hides the actions from the president', async () => {
    signInAs('u-anh')
    const { result } = renderHook(() => useDuesItemsViewModel('dues-guitar-hk1'), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.campaign).not.toBeNull())
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canExempt).toBe(false)
  })

  it('closes the dialog, says why and reloads after a 403', async () => {
    const error = vi.spyOn(toast, 'error')
    signInAs('u-mai')
    const { result } = renderHook(() => useDuesItemsViewModel('dues-guitar-hk1'), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.canClose).toBe(true))
    act(() => result.current.openClose())
    // Bảng phân quyền vừa tắt quyền ghi sổ của Thủ quỹ.
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'TREASURER', permission: 'RECORD_LEDGER', enabled: false, updatedBy: 'u-anh', updatedAt: new Date().toISOString() })
    act(() => result.current.confirmClose())
    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(error).toHaveBeenCalledWith(expect.stringContaining('đóng đợt đóng quỹ'))
    await waitFor(() => expect(result.current.canClose).toBe(false))
    expect(seeded().status).toBe('OPEN')
    error.mockRestore()
  })
})

describe('OpenDuesSheet (FR-FIN-09)', () => {
  it('adds a member to exempt, requires a reason, then opens the campaign', async () => {
    signInAs('u-mai')
    const onOpened = vi.fn()
    render(<OpenDuesSheet open onClose={() => undefined} onOpened={onOpened} />, { wrapper: await clubWrapper() })
    const user = userEvent.setup()
    const sheet = await screen.findByRole('dialog', { name: 'Mở đợt đóng quỹ' })
    await user.type(within(sheet).getByRole('textbox', { name: /Tên kỳ/ }), 'Quỹ học kỳ 2')
    await user.type(within(sheet).getByRole('textbox', { name: /Mức đóng/ }), '120000')
    await user.type(within(sheet).getByRole('textbox', { name: /Hạn nộp/ }), formatDate(vnDate(14)))
    await user.click(await within(sheet).findByRole('button', { name: 'Miễn giảm cho Ngô Bảo Trâm' }))
    await user.click(within(sheet).getByRole('button', { name: 'Mở đợt' }))
    expect(await within(sheet).findByText(/Lý do cần ít nhất/)).toBeInTheDocument()
    await user.type(within(sheet).getByRole('textbox', { name: /Lý do/ }), 'Hoàn cảnh khó khăn.')
    await user.click(within(sheet).getByRole('button', { name: 'Mở đợt' }))
    await waitFor(() => expect(onOpened).toHaveBeenCalled())
    const campaign = db.duesCampaigns.find((candidate) => candidate.name === 'Quỹ học kỳ 2')
    expect(db.duesItems.find((item) => item.campaignId === campaign?.id && item.userId === 'u-tram')?.exemption?.kind).toBe('EXEMPT')
  })
})
