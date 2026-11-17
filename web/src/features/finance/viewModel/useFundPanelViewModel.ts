import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { toVnDateKey } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { financeRepository } from '../model/financeRepository'
import type { FinanceCategory, FundDetail, TransactionQuery } from '../model/financeTypes'
import { periodRange, requestFilterDisplay, type LedgerPeriod, type RequestFilter } from './financeDisplay'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 20
/** Mã giao dịch đang mở trong sheet nằm trên URL để thông báo dẫn thẳng tới được. */
export const TRANSACTION_PARAM = 'tx'

export type FundTab = 'ledger' | 'requests'

/** Số khoản còn treo khi quỹ sự kiện đã đến lúc quyết toán (sự kiện kết thúc hoặc hủy); 0 khi không cần báo. */
export function settlePendingCount(fund: Pick<FundDetail, 'kind' | 'status' | 'event' | 'pendingCount'> | undefined): number {
  if (!fund || fund.kind !== 'EVENT' || fund.status !== 'OPEN' || !fund.event) return 0
  if (fund.event.status !== 'ENDED' && fund.event.status !== 'CANCELLED') return 0
  return fund.pendingCount ?? 0
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
  const [tab, setTab] = useState<FundTab>('ledger')
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('PENDING')
  const [mineOnly, setMineOnly] = useState(false)
  const [requestPage, setRequestPage] = useState(0)

  const fund = useQuery({ queryKey: financeQueryKeys.fund(clubId, fundId), queryFn: () => financeRepository.fund(clubId, fundId) })
  const allowed = fund.data?.allowedActions ?? []
  const [settleOpen, setSettleOpen] = useState(false)
  const [conflict, setConflict] = useState(false)

  // Quyết toán đổi cả quỹ lẫn trạng thái sự kiện (Đã kết thúc sang Đã quyết toán), nên làm mới cả hai.
  const refreshFundAndEvent = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: financeQueryKeys.all }), queryClient.invalidateQueries({ queryKey: eventQueryKeys.all })])

  const settle = useMutation({
    /** `balance`: số dư người dùng thấy trong hộp xác nhận, để câu báo nói đúng có chuyển tiền hay không. */
    mutationFn: (balance: number) => {
      if (!fund.data) throw new Error('Fund not loaded')
      return financeRepository.settle(clubId, fundId, fund.data.version).then((settled) => ({ settled, balance }))
    },
    meta: { silentError: true },
    onSuccess: async ({ settled, balance }) => {
      queryClient.setQueryData(financeQueryKeys.fund(clubId, fundId), settled)
      await refreshFundAndEvent()
      setSettleOpen(false)
      toast.success(balance > 0 ? `Đã quyết toán quỹ, chuyển ${formatMoney(balance)} về Quỹ chung.` : 'Đã quyết toán quỹ.')
    },
    onError: (error) => {
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
  const activeTab: FundTab = canViewRequests ? tab : 'ledger'
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
      setSettleOpen(true)
      void fund.refetch()
    },
    settleBalanceLoading: settleOpen && fund.isFetching,
    closeSettle: () => {
      if (!settle.isPending) setSettleOpen(false)
    },
    confirmSettle: () => settle.mutate(fund.data?.balance ?? 0),
    settling: settle.isPending,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refreshFundAndEvent()
    },
    canProposeExpense: allowed.includes('PROPOSE_EXPENSE'),
    canViewRequests,
    tab: activeTab,
    setTab: (value: string) => setTab(value === 'requests' ? 'requests' : 'ledger'),

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
