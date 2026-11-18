import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney, parseMoney } from '@/shared/format/formatMoney'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { financeRepository } from '../model/financeRepository'
import type { FinanceCategory, FundDetail, SettleShare, TransactionQuery } from '../model/financeTypes'
import { periodRange, requestFilterDisplay, type LedgerPeriod, type RequestFilter } from './financeDisplay'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 20
/** Mã giao dịch đang mở trong sheet nằm trên URL để thông báo dẫn thẳng tới được. */
export const TRANSACTION_PARAM = 'tx'

export type FundTab = 'ledger' | 'requests' | 'advances'

/** Số khoản còn treo khi quỹ sự kiện đã đến lúc quyết toán (sự kiện kết thúc hoặc hủy); 0 khi không cần báo. */
export function settlePendingCount(fund: Pick<FundDetail, 'kind' | 'status' | 'event' | 'pendingCount'> | undefined): number {
  if (!fund || fund.kind !== 'EVENT' || fund.status !== 'OPEN' || !fund.event) return 0
  if (fund.event.status !== 'ENDED' && fund.event.status !== 'CANCELLED') return 0
  return fund.pendingCount ?? 0
}

export interface ShareDraft {
  amount: string
  note: string
}

export const SHARE_NOTE_MAX = 200

/** Câu báo lỗi khoản chia từ máy chủ: câu chung kèm lý do theo từng dòng. */
function settleShareError(error: ApiError): string | null {
  const lines = error.fieldErrors.filter((fieldError) => fieldError.field.startsWith('shares')).map((fieldError) => fieldError.message)
  if (error.code !== 'SHARE_EXCEEDS_BALANCE' && lines.length === 0) return null
  return [error.detail, ...lines].filter(Boolean).join(' ')
}

/**
 * FR-FIN-11, BR-FIN-08: đổi ô nhập khoản chia thành khoản gửi đi; ô trống bỏ qua, ô sai thì báo lỗi theo CLB.
 * Tổng vượt số dư thì báo ở `total`; phần còn lại chuyển về Quỹ chung.
 */
export function settleShares(coHosts: Array<{ id: string; name: string }>, drafts: Record<string, ShareDraft>, balance: number) {
  const shares: SettleShare[] = []
  const errors: Record<string, string> = {}
  for (const club of coHosts) {
    const draft = drafts[club.id] ?? { amount: '', note: '' }
    if (draft.amount.trim() === '') continue
    const amount = parseMoney(draft.amount)
    if (amount === null || amount <= 0) errors[club.id] = 'Nhập số tiền nguyên dương, hoặc để trống nếu không chia.'
    else if (draft.note.trim().length > SHARE_NOTE_MAX) errors[club.id] = `Ghi chú tối đa ${SHARE_NOTE_MAX} ký tự.`
    else shares.push({ clubId: club.id, amount, note: draft.note.trim() })
  }
  const total = shares.reduce((sum, share) => sum + share.amount, 0)
  return {
    shares,
    errors,
    total,
    remainder: Math.max(balance - total, 0),
    totalError: total > balance ? `Tổng khoản chia ${formatMoney(total)} vượt số dư ${formatMoney(balance)}.` : null,
  }
}

/** FR-FIN-06: số dư tính tại thời điểm xem, sổ quỹ lọc theo kỳ, hạng mục, từ khóa và phân trang (FR-RPT-01). */
export function useFundPanelViewModel(fundId: string) {
  const { clubId, club } = useCurrentClub()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [period, setPeriod] = useState<LedgerPeriod>('ALL')
  const [category, setCategory] = useState<FinanceCategory | ''>('')
  const [page, setPage] = useState(0)
  // Lấy ngày hôm nay một lần khi mở trang, không gọi Date trong lúc render.
  const [today] = useState(() => toVnDateKey(new Date()))
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [tab, setTab] = useState<FundTab>('ledger')
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('PENDING')
  const [mineOnly, setMineOnly] = useState(false)
  const [requestPage, setRequestPage] = useState(0)

  const fund = useQuery({ queryKey: financeQueryKeys.fund(clubId, fundId), queryFn: () => financeRepository.fund(clubId, fundId) })
  const allowed = fund.data?.allowedActions ?? []
  const [settleOpen, setSettleOpen] = useState(false)
  const [shareDrafts, setShareDrafts] = useState<Record<string, ShareDraft>>({})
  const [conflict, setConflict] = useState(false)

  // Quyết toán mở nút đóng sự kiện (BR-EVT-05), nên làm mới cả quỹ lẫn chi tiết sự kiện.
  const refreshFundAndEvent = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: financeQueryKeys.all }), queryClient.invalidateQueries({ queryKey: eventQueryKeys.all })])

  const settle = useMutation({
    /** `balance`: phần còn lại người dùng thấy trong hộp xác nhận, để câu báo nói đúng có chuyển tiền hay không. */
    mutationFn: ({ balance, shares }: { balance: number; shares: SettleShare[] }) => {
      if (!fund.data) throw new Error('Fund not loaded')
      return financeRepository.settle(clubId, fundId, fund.data.version, shares).then((settled) => ({ settled, balance, shares }))
    },
    meta: { silentError: true },
    onSuccess: async ({ settled, balance, shares }) => {
      queryClient.setQueryData(financeQueryKeys.fund(clubId, fundId), settled)
      await refreshFundAndEvent()
      setSettleOpen(false)
      const shared = shares.reduce((sum, share) => sum + share.amount, 0)
      const parts = [
        ...(shared > 0 ? [`chia ${formatMoney(shared)} cho CLB đồng tổ chức`] : []),
        ...(balance > 0 ? [`chuyển ${formatMoney(balance)} về Quỹ chung`] : []),
      ]
      toast.success(parts.length > 0 ? `Đã quyết toán quỹ, ${parts.join(', ')}.` : 'Đã quyết toán quỹ.')
      setShareDrafts({})
    },
    onError: (error) => {
      // Khoản chia sai (CLB vừa bị gỡ, tổng vượt số dư mới) thì giữ hộp mở, giữ số đã nhập và báo lý do trong hộp.
      if (error instanceof ApiError && (error.code === 'SHARE_EXCEEDS_BALANCE' || error.fieldErrors.some((fieldError) => fieldError.field.startsWith('shares')))) {
        void fund.refetch()
        return
      }
      setSettleOpen(false)
      if (isConflict(error)) {
        setConflict(true)
        return
      }
      toast.error(getErrorMessage(error))
      void refreshFundAndEvent()
    },
  })
  const canViewRequests = allowed.includes('VIEW_REQUESTS')
  const canViewAdvances = allowed.includes('VIEW_ADVANCES')
  const activeTab: FundTab = tab === 'requests' && canViewRequests ? 'requests' : tab === 'advances' && canViewAdvances ? 'advances' : 'ledger'
  const query: TransactionQuery = {
    fundId,
    status: ['POSTED'],
    category: category || undefined,
    ...periodRange(period, today, club.currentTerm),
    q: debouncedKeyword || undefined,
    page,
    size: PAGE_SIZE,
  }
  const ledger = useQuery({
    queryKey: financeQueryKeys.transactionList(clubId, query),
    queryFn: () => financeRepository.transactions(clubId, query),
    placeholderData: keepPreviousData,
  })
  useClampPage(page, ledger.data?.totalPages, setPage)

  const requestQuery: TransactionQuery = {
    fundId,
    type: ['EXPENSE', 'ADJUSTMENT'],
    status: requestFilterDisplay[requestFilter].statuses,
    mine: mineOnly || undefined,
    page: requestPage,
    size: PAGE_SIZE,
  }
  const requests = useQuery({
    queryKey: financeQueryKeys.transactionList(clubId, requestQuery),
    queryFn: () => financeRepository.transactions(clubId, requestQuery),
    enabled: activeTab === 'requests',
    placeholderData: keepPreviousData,
  })
  useClampPage(requestPage, requests.data?.totalPages, setRequestPage)

  const openTransaction = (transactionId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(TRANSACTION_PARAM, transactionId)
    setSearchParams(next, { state: { openedInPage: true } })
  }
  // Chuyển sang giao dịch liên quan khi sheet đang mở: thay mục lịch sử hiện tại, nên đóng sheet vẫn về đúng trang.
  const switchTransaction = (transactionId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(TRANSACTION_PARAM, transactionId)
    setSearchParams(next, { replace: true, state: location.state })
  }
  // Sheet mở ngay trong trang thì đóng bằng lùi lịch sử (nút Back cũng đóng sheet); mở từ liên kết thì chỉ bỏ tham số.
  const closeTransaction = () => {
    if ((location.state as { openedInPage?: boolean } | null)?.openedInPage) {
      void navigate(-1)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete(TRANSACTION_PARAM)
    setSearchParams(next, { replace: true })
  }

  return {
    clubId,
    fund: fund.data ?? null,
    fundLoading: fund.isPending,
    // Lần tải lại lỗi mà vẫn còn bản đã tải thì giữ nguyên sổ quỹ, không thay bằng màn lỗi.
    fundError: fund.data ? null : fund.error,
    retryFund: () => void fund.refetch(),
    canRecordIncome: allowed.includes('RECORD_INCOME'),
    canSettle: allowed.includes('SETTLE'),
    /** Sự kiện đã kết thúc hoặc đã hủy nhưng quỹ còn khoản treo nên chưa quyết toán được (FR-FIN-11). */
    pendingBlocksSettle: settlePendingCount(fund.data),
    settleOpen,
    /** Mở hộp quyết toán và hỏi lại số dư, vì số tiền chuyển về Quỹ chung phải là số mới nhất. */
    openSettle: () => {
      settle.reset()
      setShareDrafts({})
      setSettleOpen(true)
      void fund.refetch()
    },
    /** CLB đồng tổ chức nhận khoản chia (FR-FIN-11); rỗng thì hộp quyết toán như cũ. */
    shareClubs: fund.data?.coHosts ?? [],
    shareDrafts,
    setShareDraft: (clubIdOfShare: string, patch: Partial<ShareDraft>) =>
      setShareDrafts((current) => ({ ...current, [clubIdOfShare]: { ...(current[clubIdOfShare] ?? { amount: '', note: '' }), ...patch } })),
    sharePlan: settleShares(fund.data?.coHosts ?? [], shareDrafts, fund.data?.balance ?? 0),
    settleBalanceLoading: settleOpen && fund.isFetching,
    closeSettle: () => {
      if (!settle.isPending) setSettleOpen(false)
    },
    confirmSettle: () => {
      const plan = settleShares(fund.data?.coHosts ?? [], shareDrafts, fund.data?.balance ?? 0)
      if (Object.keys(plan.errors).length > 0 || plan.totalError) return
      settle.mutate({ balance: plan.remainder, shares: plan.shares })
    },
    settling: settle.isPending,
    /** Lỗi khoản chia máy chủ trả về, hiện trong hộp quyết toán. */
    settleError: settle.error instanceof ApiError && settleOpen ? settleShareError(settle.error) : null,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refreshFundAndEvent()
    },
    canProposeExpense: allowed.includes('PROPOSE_EXPENSE'),
    canViewRequests,
    tab: activeTab,
    setTab: (value: string) => setTab(value === 'requests' || value === 'advances' ? value : 'ledger'),
    /** FR-FIN-07: tab Tạm ứng và nút đề xuất tạm ứng theo `allowedActions` của quỹ. */
    canViewAdvances,
    canProposeAdvance: allowed.includes('PROPOSE_ADVANCE'),
    advanceOpen,
    openProposeAdvance: () => setAdvanceOpen(true),
    closeProposeAdvance: () => setAdvanceOpen(false),

    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    period,
    setPeriod: (value: LedgerPeriod) => {
      setPeriod(value)
      setPage(0)
    },
    termAvailable: club.currentTerm !== null,
    category,
    setCategory: (value: FinanceCategory | '') => {
      setCategory(value)
      setPage(0)
    },
    filtered: period !== 'ALL' || category !== '' || debouncedKeyword !== '',
    clearFilters: () => {
      setKeyword('')
      setPeriod('ALL')
      setCategory('')
      setPage(0)
    },
    entries: ledger.data?.content ?? [],
    ledgerLoading: ledger.isPending,
    ledgerError: ledger.error,
    retryLedger: () => void ledger.refetch(),
    page,
    setPage,
    totalPages: ledger.data?.totalPages ?? 0,
    totalElements: ledger.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,

    openedTransactionId: searchParams.get(TRANSACTION_PARAM),
    openTransaction,
    switchTransaction,
    closeTransaction,

    incomeOpen,
    openIncome: () => setIncomeOpen(true),
    closeIncome: () => setIncomeOpen(false),
    proposeOpen,
    openPropose: () => setProposeOpen(true),
    closePropose: () => setProposeOpen(false),

    requestFilter,
    setRequestFilter: (value: RequestFilter) => {
      setRequestFilter(value)
      setRequestPage(0)
    },
    mineOnly,
    toggleMineOnly: () => {
      setMineOnly((current) => !current)
      setRequestPage(0)
    },
    requests: requests.data?.content ?? [],
    requestsLoading: requests.isPending,
    requestsError: requests.error,
    retryRequests: () => void requests.refetch(),
    requestPage,
    setRequestPage,
    requestTotalPages: requests.data?.totalPages ?? 0,
    requestTotalElements: requests.data?.totalElements ?? 0,
  }
}

export type FundPanelViewModel = ReturnType<typeof useFundPanelViewModel>
