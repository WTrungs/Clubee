import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { formatDate, parseVnDate, toVnDateKey } from '@/shared/format/formatDate'
import { formatNumber, parseMoney } from '@/shared/format/formatMoney'
import { useClampPage } from '@/shared/hooks/useClampPage'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { duesRepository } from '../model/duesRepository'
import type { DuesItem, DuesItemQuery, DuesItemStatus } from '../model/duesTypes'
import { DUES_ITEM_FILTERS } from './duesDisplay'
import { editDuesSchema, exemptionSchema, type EditDuesValues, type ExemptionValues } from './duesSchemas'
import { financeQueryKeys } from './financeQueryKeys'

const PAGE_SIZE = 50

export type DuesDialog = { kind: 'EDIT' } | { kind: 'CLOSE' } | { kind: 'EXEMPTION'; item: DuesItem } | null

/** FR-FIN-09: một đợt đóng quỹ: tiến độ, danh sách người (lọc, tìm, 50 dòng một trang), sửa đợt, miễn giảm, đóng đợt. */
export function useDuesItemsViewModel(campaignId: string) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const [today] = useState(() => toVnDateKey(new Date()))
  const [filter, setFilter] = useState<DuesItemStatus | 'ALL'>('ALL')
  const [keyword, setKeyword] = useState('')
  const debounced = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<DuesDialog>(null)

  const detail = useQuery({ queryKey: financeQueryKeys.duesCampaign(clubId, campaignId), queryFn: () => duesRepository.get(clubId, campaignId) })
  const campaign = detail.data ?? null
  const query: DuesItemQuery = { status: filter === 'ALL' ? undefined : filter, q: debounced || undefined, page, size: PAGE_SIZE }
  const items = useQuery({
    queryKey: financeQueryKeys.duesItems(clubId, campaignId, query),
    queryFn: () => duesRepository.items(clubId, campaignId, query),
    placeholderData: keepPreviousData,
  })
  useClampPage(page, items.data?.totalPages, setPage)

  const editForm = useForm<EditDuesValues>({
    resolver: (values, context, options) => zodResolver(editDuesSchema(today, campaign?.dueOn ?? null))(values, context, options),
    defaultValues: { name: '', dueDate: '', amount: '' },
  })
  const [exemptionFor, setExemptionFor] = useState(0)
  const exemptionForm = useForm<ExemptionValues>({
    resolver: (values, context, options) => zodResolver(exemptionSchema(exemptionFor))(values, context, options),
    defaultValues: { kind: 'EXEMPT', amount: '', reason: '' },
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: financeQueryKeys.all })
  // 409, 422: đóng hộp, báo lý do, tải lại để nút và số liệu đúng với máy chủ.
  const failed = (error: Error) => {
    setDialog(null)
    toast.error(isConflict(error) ? 'Dữ liệu vừa được người khác cập nhật. Đã tải lại bản mới nhất.' : getErrorMessage(error))
    void refresh()
  }

  const update = useMutation({
    mutationFn: (values: EditDuesValues) => {
      if (!campaign) throw new Error('Campaign not loaded')
      const amount = parseMoney(values.amount) ?? campaign.amount
      const dueOn = parseVnDate(values.dueDate) ?? campaign.dueOn
      // Chỉ gửi hạn khi đổi, để máy chủ không kiểm lại hạn cũ đã qua.
      return duesRepository.update(clubId, campaign.id, {
        name: values.name.trim(),
        dueOn: dueOn !== campaign.dueOn ? dueOn : undefined,
        amount: amount !== campaign.amount ? amount : undefined,
        version: campaign.version,
      })
    },
    meta: { silentError: true },
    onSuccess: async () => {
      await refresh()
      setDialog(null)
      toast.success('Đã lưu đợt đóng quỹ.')
    },
    onError: (error) => {
      let shown = false
      if (error instanceof ApiError && error.status === 400) {
        for (const fieldError of error.fieldErrors) {
          const field = fieldError.field === 'dueOn' ? 'dueDate' : fieldError.field
          if (field === 'name' || field === 'dueDate' || field === 'amount') {
            editForm.setError(field, { type: 'server', message: fieldError.message })
            shown = true
          }
        }
      }
      if (!shown) failed(error)
    },
  })

  const close = useMutation({
    mutationFn: () => {
      if (!campaign) throw new Error('Campaign not loaded')
      return duesRepository.close(clubId, campaign.id, campaign.version)
    },
    meta: { silentError: true },
    onSuccess: async (closed) => {
      await refresh()
      setDialog(null)
      toast.success(`Đã đóng đợt ${closed.name}. Đợt không nhận thêm khoản nộp.`)
    },
    onError: failed,
  })

  const exemption = useMutation({
    mutationFn: ({ item, values }: { item: DuesItem; values: ExemptionValues }) =>
      duesRepository.setExemption(clubId, campaignId, item.id, {
        kind: values.kind,
        amount: values.kind === 'REDUCED' ? (parseMoney(values.amount) ?? 0) : undefined,
        reason: values.kind === 'NONE' ? undefined : values.reason.trim(),
        version: item.version,
      }),
    meta: { silentError: true },
    onSuccess: async (item) => {
      await refresh()
      setDialog(null)
      toast.success(item.exemption ? `Đã cập nhật miễn giảm cho ${item.member.fullName}.` : `Đã bỏ miễn giảm cho ${item.member.fullName}.`)
    },
    onError: (error) => {
      let shown = false
      if (error instanceof ApiError && error.status === 400) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === 'reason' || fieldError.field === 'amount') {
            exemptionForm.setError(fieldError.field, { type: 'server', message: fieldError.message })
            shown = true
          }
        }
      }
      if (!shown) failed(error)
    },
  })

  const allowed = campaign?.allowedActions ?? []
  const pending = update.isPending || close.isPending || exemption.isPending
  return {
    campaign,
    loading: detail.isPending,
    error: detail.error,
    refetch: () => void detail.refetch(),
    items: items.data?.content ?? [],
    itemsLoading: items.isPending,
    itemsError: items.error,
    refetchItems: () => void items.refetch(),
    filter,
    setFilter: (value: DuesItemStatus | 'ALL') => {
      setFilter(value)
      setPage(0)
    },
    filters: DUES_ITEM_FILTERS,
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    page: items.data?.page ?? 0,
    totalPages: items.data?.totalPages ?? 0,
    totalElements: items.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    canEdit: allowed.includes('EDIT'),
    canEditAmount: allowed.includes('EDIT_AMOUNT'),
    canExempt: allowed.includes('SET_EXEMPTION'),
    canClose: allowed.includes('CLOSE'),
    canRecordPayment: allowed.includes('RECORD_PAYMENT'),
    dialog,
    pending,
    closeDialog: () => {
      if (!pending) setDialog(null)
    },
    openEdit: () => {
      if (!campaign) return
      editForm.reset({ name: campaign.name, dueDate: formatDate(campaign.dueOn), amount: formatNumber(campaign.amount) })
      setDialog({ kind: 'EDIT' })
    },
    editForm,
    submitEdit: editForm.handleSubmit((values) => update.mutate(values)),
    openClose: () => setDialog({ kind: 'CLOSE' }),
    confirmClose: () => close.mutate(),
    openExemption: (item: DuesItem) => {
      setExemptionFor(campaign?.amount ?? 0)
      exemptionForm.reset({
        kind: item.exemption?.kind ?? 'EXEMPT',
        amount: item.exemption?.kind === 'REDUCED' ? formatNumber(item.amountDue) : '',
        reason: item.exemption?.reason ?? '',
      })
      setDialog({ kind: 'EXEMPTION', item })
    },
    exemptionForm,
    submitExemption: exemptionForm.handleSubmit((values) => {
      if (dialog?.kind === 'EXEMPTION') exemption.mutate({ item: dialog.item, values })
    }),
  }
}

export type DuesItemsViewModel = ReturnType<typeof useDuesItemsViewModel>
