import { http, HttpResponse } from 'msw'
import type { DuesExemptionInput, OpenDuesRequest, RecordDuesPaymentRequest, SetExemptionRequest, UpdateDuesCampaignRequest } from '@/features/finance/model/duesTypes'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db, type DbTransaction } from '../db'
import { forbidden } from '../mockAccess'
import { canViewDues, duesItemStatus, duesTarget, hasPayments, itemsOf, owedOf, paidOf, toDuesDetail, toDuesItem, toDuesSummary } from '../mockDues'
import { canReachClubFinance, keepsLedger } from '../mockFinance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { eligibleMembers } from '../mockMembers'
import { notify } from '../mockNotifications'
import { isRealDate, nowIso, vnToday } from '../mockTime'
import { DUES_MEMBER_STATUSES, type DbDuesCampaign, type DbDuesItem } from '../seed/duesSeed'
import { generalFundId } from '../seed/financeSeed'

// FR-FIN-09: ban chủ nhiệm xem đợt đóng quỹ; mở, sửa, miễn giảm, đóng đợt cần `RECORD_LEDGER` (mặc định Thủ quỹ).
// FR-FIN-10: xác nhận đã nộp sinh khoản thu Đã ghi sổ ở Quỹ chung, hạng mục `MEMBER_DUES`.
// Danh sách người phải đóng chụp lúc mở đợt: Thử việc, Chính thức; họ tên, ban, mức đóng không đổi theo hồ sơ sau đó (BR-DATA-02).

const NAME_MIN = 3
const NAME_MAX = 100
const MAX_AMOUNT = 1_000_000_000
const ITEM_PAGE_SIZE = 50
const ITEM_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'EXEMPT']

type FieldError = { field: string; message: string }

function clubGate(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canReachClubFinance(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  if (!canViewDues(userId, clubId)) return problem(403, 'Đợt đóng quỹ chỉ ban chủ nhiệm xem được.', 'FORBIDDEN')
  return null
}

const findCampaign = (clubId: string, campaignId: unknown) => db.duesCampaigns.find((campaign) => campaign.id === campaignId && campaign.clubId === clubId)
const closedProblem = () => problem(422, 'Đợt đóng quỹ đã đóng, không sửa được nữa (BR-FIN-06).', 'CAMPAIGN_CLOSED')
const conflictProblem = (what: string) => problem(409, `${what} vừa được người khác cập nhật. Tải lại để xem dữ liệu mới nhất.`, 'VERSION_CONFLICT')
const validAmount = (amount: unknown): amount is number => typeof amount === 'number' && Number.isInteger(amount) && amount > 0 && amount <= MAX_AMOUNT

function nameErrors(name: unknown, field = 'name'): FieldError[] {
  const text = typeof name === 'string' ? name.trim() : ''
  return text.length < NAME_MIN || text.length > NAME_MAX ? [{ field, message: `Tên kỳ cần từ ${NAME_MIN} đến ${NAME_MAX} ký tự.` }] : []
}

function dueErrors(dueOn: unknown): FieldError[] {
  return !isRealDate(dueOn) || dueOn < vnToday() ? [{ field: 'dueOn', message: 'Hạn nộp từ hôm nay trở đi.' }] : []
}

/** Lý do 5–500 ký tự; mức giảm từ 1 tới dưới mức đóng. */
function exemptionErrors(input: { kind?: unknown; amount?: unknown; reason?: unknown }, fullAmount: number, prefix: string): FieldError[] {
  const errors: FieldError[] = []
  if (input.kind !== 'EXEMPT' && input.kind !== 'REDUCED') errors.push({ field: `${prefix}kind`, message: 'Chọn miễn hoặc giảm.' })
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) errors.push({ field: `${prefix}reason`, message: `Lý do miễn giảm cần từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` })
  if (input.kind === 'REDUCED' && (!validAmount(input.amount) || input.amount >= fullAmount)) {
    errors.push({ field: `${prefix}amount`, message: `Mức sau giảm từ 1 đ tới dưới ${formatMoney(fullAmount)}.` })
  }
  return errors
}

function openErrors(body: Partial<OpenDuesRequest>, clubId: string): FieldError[] {
  const errors = [...nameErrors(body.name)]
  if (!validAmount(body.amount)) errors.push({ field: 'amount', message: 'Mức đóng là số nguyên dương, tối đa 1.000.000.000 đ.' })
  errors.push(...dueErrors(body.dueOn))
  const exemptions = Array.isArray(body.exemptions) ? body.exemptions : []
  if (body.exemptions !== undefined && !Array.isArray(body.exemptions)) errors.push({ field: 'exemptions', message: 'Danh sách miễn giảm không hợp lệ.' })
  const members = new Set(eligibleMembers(clubId, { statuses: DUES_MEMBER_STATUSES }).map((member) => member.id))
  const seen = new Set<string>()
  exemptions.forEach((exemption: Partial<DuesExemptionInput>, index) => {
    const prefix = `exemptions[${index}].`
    const userId = exemption.userId ?? ''
    if (!members.has(userId) || seen.has(userId)) errors.push({ field: `${prefix}userId`, message: 'Người này không thuộc danh sách phải đóng hoặc bị chọn trùng.' })
    seen.add(userId)
    errors.push(...exemptionErrors(exemption, validAmount(body.amount) ? body.amount : Number.MAX_SAFE_INTEGER, prefix))
  })
  return errors
}

const itemExemption = (exemption: { kind: 'EXEMPT' | 'REDUCED'; reason: string }, by: string) => ({ kind: exemption.kind, reason: exemption.reason.trim(), by, at: nowIso() })
const dueAfterExemption = (kind: 'EXEMPT' | 'REDUCED' | 'NONE', amount: number | undefined, full: number) => (kind === 'EXEMPT' ? 0 : kind === 'REDUCED' ? (amount ?? full) : full)

export const duesHandlers = [
  http.get(`${API}/clubs/:clubId/dues-campaigns`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    if (status && status !== 'OPEN' && status !== 'CLOSED') return problem(400, 'Trạng thái không hợp lệ.', 'VALIDATION')
    const rows = db.duesCampaigns
      .filter((campaign) => campaign.clubId === clubId && (!status || campaign.status === status))
      // Đợt đang mở lên trước, rồi đợt mới mở trước.
      .toSorted((a, b) => Number(a.status === 'CLOSED') - Number(b.status === 'CLOSED') || b.openedAt.localeCompare(a.openedAt))
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map(toDuesSummary) })
  }),

  http.get(`${API}/clubs/:clubId/dues-candidates`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    // Chỉ tên và ban, như các danh sách chọn người khác (SRS 3.5).
    return HttpResponse.json(eligibleMembers(clubId, { statuses: DUES_MEMBER_STATUSES, keyword: new URL(request.url).searchParams.get('q') }))
  }),

  http.post(`${API}/clubs/:clubId/dues-campaigns`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const userId = user.value.id
    if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'mở đợt đóng quỹ')
    const body = (await request.json()) as Partial<OpenDuesRequest>
    const errors = openErrors(body, clubId)
    if (errors.length > 0) return problem(400, 'Thông tin đợt đóng quỹ chưa hợp lệ.', 'VALIDATION', errors)
    const campaign: DbDuesCampaign = {
      id: newId('dues'),
      clubId,
      name: (body.name ?? '').trim(),
      amount: body.amount as number,
      dueOn: body.dueOn as string,
      status: 'OPEN',
      openedBy: userId,
      openedAt: nowIso(),
      closedBy: null,
      closedAt: null,
      version: 1,
    }
    db.duesCampaigns.push(campaign)
    const exemptions = new Map((body.exemptions ?? []).map((exemption) => [exemption.userId, exemption]))
    const members = db.memberships.filter((membership) => membership.clubId === clubId && DUES_MEMBER_STATUSES.includes(membership.status))
    for (const membership of members) {
      const exemption = exemptions.get(membership.userId)
      const member = eligibleMembers(clubId, { statuses: DUES_MEMBER_STATUSES }).find((candidate) => candidate.id === membership.userId)
      const item: DbDuesItem = {
        id: newId('duesi'),
        campaignId: campaign.id,
        clubId,
        membershipId: membership.id,
        userId: membership.userId,
        memberName: member?.fullName ?? '',
        departmentName: member?.departmentName ?? null,
        amountDue: exemption ? dueAfterExemption(exemption.kind, exemption.amount, campaign.amount) : campaign.amount,
        exemption: exemption ? itemExemption(exemption, userId) : null,
        payments: [],
        remindedSoonAt: null,
        remindedOverdueAt: null,
        version: 1,
      }
      db.duesItems.push(item)
      // Người được miễn toàn bộ không phải đóng nên không báo; người được giảm thấy mức của chính mình.
      if (item.amountDue > 0) {
        notify([item.userId], {
          clubId,
          category: 'FINANCE',
          title: `Đóng quỹ: ${campaign.name}`,
          body: `Mức của bạn ${formatMoney(item.amountDue)}, hạn nộp ${formatDate(campaign.dueOn)}.`,
          target: duesTarget(campaign),
          actorId: userId,
        })
      }
    }
    return HttpResponse.json(toDuesDetail(campaign, userId), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/dues-campaigns/:campaignId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    if (!campaign) return problem(404, 'Không tìm thấy đợt đóng quỹ.', 'CAMPAIGN_NOT_FOUND')
    return HttpResponse.json(toDuesDetail(campaign, user.value.id))
  }),

  http.patch(`${API}/clubs/:clubId/dues-campaigns/:campaignId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    if (!campaign) return problem(404, 'Không tìm thấy đợt đóng quỹ.', 'CAMPAIGN_NOT_FOUND')
    if (!keepsLedger(user.value.id, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'sửa đợt đóng quỹ')
    const body = (await request.json()) as Partial<UpdateDuesCampaignRequest>
    if (body.version !== campaign.version) return conflictProblem('Đợt đóng quỹ')
    if (campaign.status !== 'OPEN') return closedProblem()
    const amountChanges = body.amount !== undefined && body.amount !== campaign.amount
    if (amountChanges && hasPayments(campaign.id)) return problem(422, 'Đã có người nộp nên không đổi mức đóng được nữa.', 'HAS_PAYMENTS')
    const errors: FieldError[] = [...(body.name !== undefined ? nameErrors(body.name) : []), ...(body.dueOn !== undefined && body.dueOn !== campaign.dueOn ? dueErrors(body.dueOn) : [])]
    const items = itemsOf(campaign.id)
    if (amountChanges) {
      if (!validAmount(body.amount)) errors.push({ field: 'amount', message: 'Mức đóng là số nguyên dương, tối đa 1.000.000.000 đ.' })
      else if (items.some((item) => item.exemption?.kind === 'REDUCED' && item.amountDue >= (body.amount as number))) {
        errors.push({ field: 'amount', message: 'Mức mới phải cao hơn mức sau giảm của những người được giảm.' })
      }
    }
    if (errors.length > 0) return problem(400, 'Thông tin đợt đóng quỹ chưa hợp lệ.', 'VALIDATION', errors)
    if (body.name !== undefined) campaign.name = body.name.trim()
    if (body.dueOn !== undefined && body.dueOn !== campaign.dueOn) {
      campaign.dueOn = body.dueOn
      // Hạn mới thì nhắc lại theo hạn mới (FR-FIN-10).
      for (const item of items) Object.assign(item, { remindedSoonAt: null, remindedOverdueAt: null })
    }
    if (amountChanges) {
      campaign.amount = body.amount as number
      for (const item of items) {
        if (item.exemption === null) {
          item.amountDue = campaign.amount
          item.version += 1
        }
      }
    }
    campaign.version += 1
    return HttpResponse.json(toDuesDetail(campaign, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/dues-campaigns/:campaignId/items`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    if (!campaign) return problem(404, 'Không tìm thấy đợt đóng quỹ.', 'CAMPAIGN_NOT_FOUND')
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    if (status && !ITEM_STATUSES.includes(status)) return problem(400, 'Trạng thái không hợp lệ.', 'VALIDATION')
    const rows = itemsOf(campaign.id)
      .filter((item) => !status || duesItemStatus(item) === status)
      .filter((item) => matchesKeyword(`${item.memberName} ${item.departmentName ?? ''}`, url.searchParams.get('q')))
      .toSorted((a, b) => a.memberName.localeCompare(b.memberName, 'vi'))
    const page = paginate(rows, url, ITEM_PAGE_SIZE)
    return HttpResponse.json({ ...page, content: page.content.map(toDuesItem) })
  }),

  http.put(`${API}/clubs/:clubId/dues-campaigns/:campaignId/items/:itemId/exemption`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    const item = campaign ? itemsOf(campaign.id).find((candidate) => candidate.id === params.itemId) : undefined
    if (!campaign || !item) return problem(404, 'Không tìm thấy người này trong đợt đóng quỹ.', 'ITEM_NOT_FOUND')
    const userId = user.value.id
    if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'miễn giảm đóng quỹ')
    const body = (await request.json()) as Partial<SetExemptionRequest>
    if (body.version !== item.version) return conflictProblem('Khoản đóng quỹ của người này')
    if (campaign.status !== 'OPEN') return closedProblem()
    if (body.kind !== 'NONE') {
      const errors = exemptionErrors(body, campaign.amount, '')
      if (errors.length > 0) return problem(400, 'Thông tin miễn giảm chưa hợp lệ.', 'VALIDATION', errors)
    }
    const kind = body.kind ?? 'NONE'
    const due = dueAfterExemption(kind, body.amount, campaign.amount)
    // Đã nộp bao nhiêu thì mức sau miễn giảm không thấp hơn số đó; khoản nộp không tự hoàn.
    const paid = paidOf(item)
    if (due < paid) return problem(422, `${item.memberName} đã nộp ${formatMoney(paid)}; mức sau miễn giảm không được thấp hơn số này.`, 'BELOW_PAID')
    item.amountDue = due
    item.exemption = kind === 'NONE' ? null : itemExemption({ kind, reason: body.reason ?? '' }, userId)
    item.version += 1
    campaign.version += 1
    return HttpResponse.json(toDuesItem(item))
  }),

  http.post(`${API}/clubs/:clubId/dues-campaigns/:campaignId/closure`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    if (!campaign) return problem(404, 'Không tìm thấy đợt đóng quỹ.', 'CAMPAIGN_NOT_FOUND')
    if (!keepsLedger(user.value.id, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'đóng đợt đóng quỹ')
    const body = (await request.json()) as { version?: number }
    if (body.version !== campaign.version) return conflictProblem('Đợt đóng quỹ')
    if (campaign.status !== 'OPEN') return closedProblem()
    Object.assign(campaign, { status: 'CLOSED', closedBy: user.value.id, closedAt: nowIso(), version: campaign.version + 1 })
    return HttpResponse.json(toDuesDetail(campaign, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/dues-campaigns/:campaignId/items/:itemId/payments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const campaign = findCampaign(clubId, params.campaignId)
    const item = campaign ? itemsOf(campaign.id).find((candidate) => candidate.id === params.itemId) : undefined
    if (!campaign || !item) return problem(404, 'Không tìm thấy người này trong đợt đóng quỹ.', 'ITEM_NOT_FOUND')
    const userId = user.value.id
    if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'xác nhận đã nộp quỹ')
    const body = (await request.json()) as Partial<RecordDuesPaymentRequest>
    // Lệch phiên bản: lần bấm thứ hai không sinh thêm khoản thu (NFR-REL-01).
    if (body.version !== item.version) return conflictProblem('Khoản đóng quỹ của người này')
    if (campaign.status !== 'OPEN') return closedProblem()
    const owed = owedOf(item)
    if (owed === 0) return problem(422, `${item.memberName} đã nộp đủ hoặc được miễn.`, 'ALREADY_PAID')
    const errors: FieldError[] = []
    if (!validAmount(body.amount) || body.amount > owed) errors.push({ field: 'amount', message: `Số tiền từ 1 đ tới số còn thiếu ${formatMoney(owed)}.` })
    if (!isRealDate(body.paidOn) || body.paidOn > vnToday()) errors.push({ field: 'paidOn', message: 'Ngày nộp không hợp lệ hoặc sau hôm nay.' })
    if (errors.length > 0) return problem(400, 'Thông tin khoản nộp chưa hợp lệ.', 'VALIDATION', errors)
    const now = nowIso()
    const transaction: DbTransaction = {
      id: newId('tx'),
      clubId,
      fundId: generalFundId(clubId),
      type: 'INCOME',
      direction: 'IN',
      amount: body.amount as number,
      category: 'MEMBER_DUES',
      description: `Đóng quỹ ${campaign.name}: ${item.memberName}`,
      occurredOn: body.paidOn as string,
      status: 'POSTED',
      proposerId: userId,
      approverId: null,
      posterId: userId,
      attachmentIds: [],
      originalId: null,
      targetFundId: null,
      rejectionReason: null,
      createdAt: now,
      decidedAt: null,
      postedAt: now,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      version: 1,
      duesItemId: item.id,
    }
    db.transactions.push(transaction)
    item.payments.push({ id: newId('duesp'), amount: transaction.amount, paidOn: transaction.occurredOn ?? vnToday(), confirmedBy: userId, confirmedAt: now, transactionId: transaction.id })
    item.version += 1
    campaign.version += 1
    const left = owedOf(item)
    notify([item.userId], {
      clubId,
      category: 'FINANCE',
      title: `Đã ghi nhận nộp quỹ: ${campaign.name}`,
      body: left > 0 ? `Đã nhận ${formatMoney(transaction.amount)}, còn thiếu ${formatMoney(left)}.` : `Đã nhận ${formatMoney(transaction.amount)}. Bạn đã nộp đủ.`,
      target: duesTarget(campaign),
      actorId: userId,
    })
    return HttpResponse.json(toDuesItem(item), { status: 201 })
  }),
]
