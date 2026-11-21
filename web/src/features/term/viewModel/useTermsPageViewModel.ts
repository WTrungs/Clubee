import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { termRepository } from '../model/termRepository'
import type { Term } from '../model/termTypes'
import { groupTerms, overdueHintText } from './termDisplay'
import { termQueryKeys } from './termQueryKeys'

export type TermFormState = { mode: 'create' } | { mode: 'edit'; term: Term } | null

/** Trang Nhiệm kỳ: nhiệm kỳ đang phụ trách, nhiệm kỳ Chuẩn bị kèm kế hoạch ban, các nhiệm kỳ đã qua (FR-TERM-01, 03). */
export function useTermsPageViewModel() {
  const { clubId, club } = useCurrentClub()
  const navigate = useNavigate()
  // Bắt đầu bàn giao đổi cả quyền gán chức vụ ở Cơ cấu, Thành viên và hồ sơ CLB.
  const refresh = useRefreshMemberData(clubId)
  const query = useQuery({ queryKey: termQueryKeys.list(clubId), queryFn: () => termRepository.list(clubId) })
  const groups = useMemo(() => groupTerms(query.data ?? []), [query.data])
  const [termForm, setTermForm] = useState<TermFormState>(null)
  // Nhớ theo mã nhiệm kỳ, để nhiệm kỳ Chuẩn bị biến mất rồi có nhiệm kỳ khác thì sheet không tự mở lại.
  const [planTermId, setPlanTermId] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [extendTermId, setExtendTermId] = useState<string | null>(null)
  const { current, preparing } = groups

  const start = useMutation({
    mutationFn: ({ fromTermId, toTermId }: { fromTermId: string; toTermId: string }) => termRepository.startHandover(clubId, { fromTermId, toTermId }),
    meta: { silentError: true },
    onSuccess: async (handover) => {
      await refresh()
      setStartOpen(false)
      toast.success('Đã bắt đầu bàn giao. Hãy ghi kết quả bầu.')
      void navigate(`/clubs/${encodeURIComponent(clubId)}/handovers/${encodeURIComponent(handover.id)}`)
    },
    onError: (error) => {
      // Phiên đã có hoặc nhiệm kỳ vừa đổi ở nơi khác: báo lý do của máy chủ rồi tải lại trang.
      toast.error(getErrorMessage(error))
      setStartOpen(false)
      void refresh()
    },
  })

  const canCreate = club.allowedActions.includes('CREATE_TERM')
  const canStartHandover = (current !== null && preparing?.allowedActions.includes('START_HANDOVER')) ?? false
  const canExtend = current?.allowedActions.includes('EXTEND') ?? false
  return {
    clubId,
    clubName: club.name,
    loading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
    current,
    preparing,
    past: groups.past,
    canCreate,
    canEdit: preparing?.allowedActions.includes('EDIT') ?? false,
    canStartHandover,
    canExtend,
    overdueHint: overdueHintText({ create: canCreate, startHandover: canStartHandover, extend: canExtend }),
    // Lấy nhiệm kỳ mới nhất từ danh sách để version luôn khớp bản đang có.
    extendTerm: current && current.id === extendTermId && canExtend ? current : null,
    openExtend: () => setExtendTermId(current?.id ?? null),
    closeExtend: () => setExtendTermId(null),
    termForm,
    openCreate: () => setTermForm({ mode: 'create' }),
    openEdit: (term: Term) => setTermForm({ mode: 'edit', term }),
    closeTermForm: () => setTermForm(null),
    // Sheet kế hoạch luôn lấy nhiệm kỳ Chuẩn bị mới nhất từ danh sách, để sau khi tải lại vẫn đúng bản đang có.
    planTerm: preparing && preparing.id === planTermId ? preparing : null,
    openPlan: () => setPlanTermId(preparing?.id ?? null),
    closePlan: () => setPlanTermId(null),
    startOpen,
    openStart: () => setStartOpen(true),
    closeStart: () => setStartOpen(false),
    startPending: start.isPending,
    confirmStart: () => {
      if (current && preparing) start.mutate({ fromTermId: current.id, toTermId: preparing.id })
    },
    /** FR-ORG-06: chức vụ thường trực của nhiệm kỳ đã đóng, ở tab Chức vụ trang Cơ cấu. */
    positionsPath: (term: Term) => `/clubs/${encodeURIComponent(clubId)}/structure?tab=positions&term=${encodeURIComponent(term.id)}`,
    handoverPath: (term: Term) =>
      term.handoverId && term.allowedActions.includes('VIEW_HANDOVER') ? `/clubs/${encodeURIComponent(clubId)}/handovers/${encodeURIComponent(term.handoverId)}` : null,
  }
}
