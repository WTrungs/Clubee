import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { RESPONSE_DAYS_MAX, RESPONSE_DAYS_MIN } from '@/shared/lib/recruitmentRules'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { FinalDecision, ProposalRow, RecruitmentDetail } from '../model/recruitmentTypes'
import { quotaUsage } from './recruitmentDisplay'
import { recruitmentQueryKeys } from './recruitmentQueryKeys'

export interface DraftDecision {
  applicationId: string
  decision: FinalDecision
  departmentId: string | null
  reserveOrder: string
}

const toDraft = (row: ProposalRow): DraftDecision => ({ applicationId: row.application.id, decision: row.decision, departmentId: row.departmentId, reserveOrder: row.reserveOrder ? String(row.reserveOrder) : '' })

/** Lỗi soạn kết quả phát hiện được ngay ở form; vượt chỉ tiêu và lỗi khác do máy chủ kiểm lại. */
export function draftProblems(drafts: DraftDecision[], days: string): string[] {
  const problems: string[] = []
  const orders = new Map<string, Set<string>>()
  for (const draft of drafts) {
    if (draft.decision !== 'NOT_ADMITTED' && !draft.departmentId) problems.push('Đơn Trúng tuyển hoặc Dự bị phải có ban.')
    if (draft.decision === 'RESERVE') {
      const key = draft.departmentId ?? ''
      const used = orders.get(key) ?? new Set<string>()
      if (!/^[1-9]\d*$/.test(draft.reserveOrder)) problems.push('Thứ tự dự bị là số nguyên từ 1.')
      else if (used.has(draft.reserveOrder)) problems.push('Thứ tự dự bị bị trùng trong một ban.')
      used.add(draft.reserveOrder)
      orders.set(key, used)
    }
  }
  const value = Number(days)
  if (!/^\d+$/.test(days) || value < RESPONSE_DAYS_MIN || value > RESPONSE_DAYS_MAX) problems.push(`Số ngày nhận kết quả từ ${RESPONSE_DAYS_MIN} đến ${RESPONSE_DAYS_MAX}.`)
  return [...new Set(problems)]
}

export interface DepartmentSection {
  key: string
  title: string
  rows: ProposalRow[]
}

/** Chia đề xuất theo ban (Trúng tuyển rồi Dự bị theo thứ tự, giữ hạng), cuối cùng là nhóm Trượt; dòng đổi ban thì sang nhóm của ban đó. */
export function groupByDepartment(rows: ProposalRow[], drafts: DraftDecision[], quotas: Array<{ departmentId: string; departmentName: string }>): DepartmentSection[] {
  const draftOf = (row: ProposalRow) => drafts.find((draft) => draft.applicationId === row.application.id) ?? toDraft(row)
  const order = (row: ProposalRow) => {
    const draft = draftOf(row)
    return draft.decision === 'ADMITTED' ? 0 : 1 + (Number(draft.reserveOrder) || 0)
  }
  const sections = quotas.map((quota) => ({
    key: quota.departmentId,
    title: `Ban ${quota.departmentName}`,
    rows: rows.filter((row) => draftOf(row).decision !== 'NOT_ADMITTED' && draftOf(row).departmentId === quota.departmentId).toSorted((a, b) => order(a) - order(b) || (a.rank ?? 0) - (b.rank ?? 0)),
  }))
  const rejected = rows.filter((row) => draftOf(row).decision === 'NOT_ADMITTED')
  return [...sections, ...(rejected.length > 0 ? [{ key: 'not-admitted', title: 'Trượt', rows: rejected }] : [])]
}

/** FR-REC-07: xem đề xuất theo ban, sửa từng dòng rồi chốt; version lấy lúc mở sheet để 409 bắt được thay đổi của người khác. */
export function useResultsViewModel(clubId: string, recruitment: RecruitmentDetail, enabled: boolean) {
  const queryClient = useQueryClient()
  const finalized = recruitment.finalizedAt !== null
  const proposal = useQuery({
    queryKey: recruitmentQueryKeys.proposal(clubId, recruitment.id),
    queryFn: () => recruitmentRepository.proposal(clubId, recruitment.id),
    enabled: enabled && !finalized,
    staleTime: 0,
  })
  const [drafts, setDrafts] = useState<DraftDecision[] | null>(null)
  const [draftVersion, setDraftVersion] = useState(0)
  const [days, setDays] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.all })
  const mutation = useMutation({
    mutationFn: () =>
      recruitmentRepository.finalize(clubId, recruitment.id, {
        decisions: (drafts ?? []).map((draft) => ({
          applicationId: draft.applicationId,
          decision: draft.decision,
          departmentId: draft.decision === 'NOT_ADMITTED' ? null : draft.departmentId,
          reserveOrder: draft.decision === 'RESERVE' ? Number(draft.reserveOrder) : null,
        })),
        responseDays: Number(days),
        version: draftVersion,
      }),
    meta: { silentError: true },
    onMutate: () => setServerError(null),
    onSuccess: async () => {
      await refresh()
      toast.success('Đã chốt kết quả và gửi thông báo cho từng ứng viên.')
      setDrafts(null)
    },
    onError: (error) => {
      // Vượt chỉ tiêu (422) thì giữ sheet để sửa; đợt vừa đổi (409), đã chốt hoặc mất quyền thì đóng và tải lại.
      if (error instanceof ApiError && error.code === 'QUOTA_EXCEEDED') {
        setServerError(getErrorMessage(error))
        return
      }
      if (isConflict(error) || isForbidden(error) || (error instanceof ApiError && error.status === 422)) {
        toast.error(getErrorMessage(error))
        setDrafts(null)
        void refresh()
        return
      }
      setServerError(error instanceof ApiError && error.fieldErrors.length > 0 ? error.fieldErrors.map((fieldError) => fieldError.message).join(' ') : getErrorMessage(error))
    },
  })

  const rows = proposal.data?.rows ?? []
  const quotas = proposal.data?.quotas ?? []
  const current = drafts ?? rows.map(toDraft)
  const problems = draftProblems(current, days)
  return {
    finalized,
    canFinalize: recruitment.allowedActions.includes('FINALIZE'),
    loading: !finalized && proposal.isPending,
    error: finalized ? null : proposal.error,
    refetch: () => void proposal.refetch(),
    blockers: proposal.data?.blockers ?? [],
    rows,
    sections: groupByDepartment(rows, current, quotas),
    usage: quotaUsage(quotas, current),
    editing: drafts !== null,
    start: () => {
      setDrafts(rows.map(toDraft))
      setDraftVersion(proposal.data?.version ?? recruitment.version)
      setDays(String(proposal.data?.defaultResponseDays ?? ''))
      setTouched(false)
      setServerError(null)
    },
    cancel: () => !mutation.isPending && setDrafts(null),
    draftOf: (applicationId: string) => current.find((draft) => draft.applicationId === applicationId),
    update: (applicationId: string, change: Partial<DraftDecision>) =>
      setDrafts((list) => (list ?? []).map((draft) => (draft.applicationId === applicationId ? { ...draft, ...change, ...(change.decision === 'NOT_ADMITTED' ? { departmentId: null, reserveOrder: '' } : {}) } : draft))),
    days,
    setDays,
    problems: touched ? problems : [],
    serverError,
    submit: () => {
      setTouched(true)
      if (problems.length === 0) mutation.mutate()
    },
    pending: mutation.isPending,
  }
}

export type ResultsViewModel = ReturnType<typeof useResultsViewModel>

/** Một nhóm kết quả sau khi chốt, có phân trang riêng để đợt đông đơn vẫn đủ người (FR-REC-07). */
export function useResultGroupViewModel(clubId: string, recruitmentId: string, outcome: FinalDecision, enabled: boolean) {
  const [page, setPage] = useState(0)
  const list = useQuery({
    queryKey: recruitmentQueryKeys.results(clubId, recruitmentId, outcome, page),
    queryFn: () => recruitmentRepository.applications(clubId, recruitmentId, { outcome, page }),
    enabled,
    placeholderData: keepPreviousData,
  })
  return {
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: list.data?.size ?? 50,
    setPage,
  }
}

/** FR-REC-08: gọi người dự bị kế tiếp vào chỗ trống và đóng đợt; mọi lỗi đều báo rồi tải lại để số chỗ trống luôn đúng. */
export function useResultActionsViewModel(clubId: string, recruitment: RecruitmentDetail) {
  const queryClient = useQueryClient()
  const [closeOpen, setCloseOpen] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.all })
  const fail = (error: unknown) => {
    toast.error(getErrorMessage(error))
    setCloseOpen(false)
    void refresh()
  }
  const call = useMutation({
    mutationFn: (departmentId: string) => recruitmentRepository.callReserve(clubId, recruitment.id, departmentId, recruitment.version),
    meta: { silentError: true },
    onSuccess: async (_saved, departmentId) => {
      await refresh()
      toast.success(`Đã gọi người dự bị kế tiếp của ban ${recruitment.departmentResults.find((result) => result.departmentId === departmentId)?.departmentName ?? ''}.`)
    },
    onError: fail,
  })
  const close = useMutation({
    mutationFn: () => recruitmentRepository.close(clubId, recruitment.id, recruitment.version),
    meta: { silentError: true },
    onSuccess: async () => {
      await refresh()
      toast.success('Đã đóng đợt tuyển.')
      setCloseOpen(false)
    },
    onError: fail,
  })
  const canCall = recruitment.allowedActions.includes('CALL_RESERVE')
  return {
    results: recruitment.departmentResults,
    canCallFor: (departmentId: string) => {
      const result = recruitment.departmentResults.find((candidate) => candidate.departmentId === departmentId)
      return canCall && result !== undefined && result.freeSlots > 0 && result.reserves > 0
    },
    callReserve: (departmentId: string) => call.mutate(departmentId),
    callingId: call.isPending ? (call.variables ?? null) : null,
    canClose: recruitment.allowedActions.includes('CLOSE'),
    waiting: recruitment.departmentResults.reduce((total, result) => total + result.pending, 0),
    closeOpen,
    openClose: () => setCloseOpen(true),
    dismissClose: () => !close.isPending && setCloseOpen(false),
    confirmClose: () => close.mutate(),
    closing: close.isPending,
  }
}

export type ResultActionsViewModel = ReturnType<typeof useResultActionsViewModel>
