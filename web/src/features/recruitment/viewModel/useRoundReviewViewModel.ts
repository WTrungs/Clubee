import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { ROUND_SCORE_MAX, ROUND_SCORE_MIN } from '@/shared/lib/recruitmentRules'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { ApplicationQuery, ApplicationSummary, RecruitmentDetail, RoundResultValue, RoundState } from '../model/recruitmentTypes'
import { recruitmentQueryKeys } from './recruitmentQueryKeys'

export interface ReviewTarget {
  application: ApplicationSummary
  result: RoundResultValue
  /** Giữ vòng lúc mở hộp để lượt ghi luôn đúng vòng đang xét. */
  roundId: string
  roundName: string
}

export const ROUND_STATES: Array<{ value: RoundState; label: string }> = [
  { value: 'PENDING', label: 'Chờ xét' },
  { value: 'PASSED', label: 'Đạt' },
  { value: 'FAILED', label: 'Loại' },
]

/** Điểm nhập dạng chữ; null là chưa hợp lệ. */
export function parseScore(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null
  const score = Number(text.trim())
  return score >= ROUND_SCORE_MIN && score <= ROUND_SCORE_MAX ? score : null
}

/** Thao tác của ban chủ nhiệm với một đơn ở vòng đang xem: xét mới hoặc sửa kết quả còn sửa được. */
export function reviewActionsOf(application: ApplicationSummary, roundId: string, canReview: boolean): Array<'PASS' | 'FAIL' | 'EDIT'> {
  if (!canReview) return []
  if (application.currentRoundId === roundId) return ['PASS', 'FAIL']
  return application.roundResults.some((result) => result.roundId === roundId && result.editable) ? ['EDIT'] : []
}

const PAGE_SIZE = 50

/** FR-REC-03: lọc đơn theo vòng; Đạt kèm điểm, Loại kèm nhận xét; xét được ngay khi đợt còn nhận đơn. */
export function useRoundReviewViewModel(clubId: string, recruitment: RecruitmentDetail, enabled: boolean) {
  const queryClient = useQueryClient()
  const [roundId, setRoundId] = useState(recruitment.rounds[0]?.id ?? '')
  const [roundState, setRoundState] = useState<RoundState>('PENDING')
  const [page, setPage] = useState(0)
  const [target, setTarget] = useState<ReviewTarget | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const canReview = recruitment.allowedActions.includes('REVIEW_ROUNDS')

  const query: ApplicationQuery = { roundId, roundState, page }
  const list = useQuery({
    queryKey: recruitmentQueryKeys.applicationPage(clubId, recruitment.id, query),
    queryFn: () => recruitmentRepository.applications(clubId, recruitment.id, query),
    enabled: enabled && roundId !== '',
    placeholderData: keepPreviousData,
  })
  // Sheet chi tiết đơn đọc khóa riêng nên phải làm mới cùng danh sách, nếu không sẽ hiện kết quả vòng cũ.
  const refresh = (applicationId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.applications(clubId, recruitment.id) }),
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.detail(clubId, recruitment.id) }),
      queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.application(clubId, applicationId) }),
    ])

  const mutation = useMutation({
    mutationFn: ({ target: reviewed, result, score, note }: { target: ReviewTarget; result: RoundResultValue; score: number | null; note: string }) =>
      recruitmentRepository.reviewRound(clubId, recruitment.id, reviewed.application.id, reviewed.roundId, { result, score, note, version: reviewed.application.version }),
    meta: { silentError: true },
    onMutate: () => setDialogError(null),
    onSuccess: async (saved, { result }) => {
      queryClient.setQueryData(recruitmentQueryKeys.application(clubId, saved.id), saved)
      await refresh(saved.id)
      toast.success(result === 'PASS' ? `${saved.applicant.fullName} đạt vòng này.` : `Đã loại ${saved.applicant.fullName} ở vòng này.`)
      setTarget(null)
    },
    onError: (error, { target: reviewed }) => {
      // Đơn vừa đổi (409), đợt đã chốt hoặc vòng bị khóa (422), mất quyền (403): báo, đóng và tải lại.
      if (isConflict(error) || isForbidden(error) || (error instanceof ApiError && error.status === 422)) {
        toast.error(getErrorMessage(error))
        setTarget(null)
        void refresh(reviewed.application.id)
        return
      }
      setDialogError(error instanceof ApiError && error.fieldErrors.length > 0 ? error.fieldErrors.map((fieldError) => fieldError.message).join(' ') : getErrorMessage(error))
    },
  })

  const stats = recruitment.roundStats.find((stat) => stat.roundId === roundId)
  return {
    canReview,
    rounds: recruitment.rounds.map((round, index) => ({ ...round, label: `Vòng ${index + 1}: ${round.name}`, pending: recruitment.roundStats.find((stat) => stat.roundId === round.id)?.pending ?? 0 })),
    roundId,
    setRoundId: (value: string) => {
      setRoundId(value)
      setPage(0)
    },
    states: ROUND_STATES.map((state) => ({ ...state, count: stats ? { PENDING: stats.pending, PASSED: stats.passed, FAILED: stats.failed }[state.value] : 0 })),
    roundState,
    setRoundState: (value: RoundState) => {
      setRoundState(value)
      setPage(0)
    },
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    actionsOf: (application: ApplicationSummary) => reviewActionsOf(application, roundId, canReview),
    resultOf: (application: ApplicationSummary) => application.roundResults.find((result) => result.roundId === roundId) ?? null,
    target,
    open: (application: ApplicationSummary, result: RoundResultValue) => {
      setDialogError(null)
      setTarget({ application, result, roundId, roundName: recruitment.rounds.find((round) => round.id === roundId)?.name ?? '' })
    },
    close: () => !mutation.isPending && setTarget(null),
    submit: (result: RoundResultValue, score: number | null, note: string) => target && mutation.mutate({ target, result, score, note }),
    pending: mutation.isPending,
    dialogError,
  }
}

export type RoundReviewViewModel = ReturnType<typeof useRoundReviewViewModel>
