import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { attendanceQueryKeys } from '@/features/attendance/viewModel/attendanceQueryKeys'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { financeQueryKeys } from '@/features/finance/viewModel/financeQueryKeys'
import { eventRepository } from '../model/eventRepository'
import type { EventTransitionAction } from '../model/eventTypes'
import { closeHint, eventActionSuccess, eventTransitions, lifecycleSteps, needsDialog, seatInfo } from './eventDisplay'
import { eventQueryKeys } from './eventQueryKeys'

export type EventTab = 'overview' | 'progress' | 'staff' | 'registrations' | 'attendance' | 'fund'

interface TransitionInput {
  action: EventTransitionAction
  reason?: string
  leadUserId?: string
}

export function useEventDetailViewModel() {
  const { clubId } = useCurrentClub()
  const { eventId = '' } = useParams()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<EventTransitionAction | null>(null)
  const [conflict, setConflict] = useState(false)
  const [justRegistered, setJustRegistered] = useState(false)

  const detail = useQuery({ queryKey: eventQueryKeys.detail(clubId, eventId), queryFn: () => eventRepository.get(clubId, eventId) })
  const event = detail.data ?? null
  const allowed = event?.allowedActions ?? []
  const leadCandidates = useQuery({
    queryKey: eventQueryKeys.leadCandidates(clubId),
    queryFn: () => eventRepository.leadCandidates(clubId),
    enabled: dialog === 'APPROVE',
  })

  const refreshAfterWrite = async ({ detail = true }: { detail?: boolean } = {}) => {
    await Promise.all([
      detail && queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.lists }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.registrationsOf(clubId, eventId) }),
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) }),
      // Duyệt tạo quỹ sự kiện, đóng sự kiện đổi quyền xem quỹ: danh sách quỹ ở trang Tài chính phải tải lại.
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.all }),
      // Đóng, hủy sự kiện làm điểm danh chỉ xem được.
      queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets({ type: 'EVENT', clubId, id: eventId }) }),
    ])
  }

  const transition = useMutation({
    mutationFn: (input: TransitionInput) => {
      if (!event) throw new Error('Event not loaded')
      return eventRepository.transition(clubId, eventId, { ...input, version: event.version })
    },
    meta: { silentError: true },
    onSuccess: async (updated, input) => {
      // Phản hồi của máy chủ đã là bản chi tiết mới nhất nên không tải lại chi tiết.
      queryClient.setQueryData(eventQueryKeys.detail(clubId, eventId), updated)
      await refreshAfterWrite({ detail: false })
      setDialog(null)
      toast.success(eventActionSuccess[input.action])
    },
    onError: (error) => {
      if (isConflict(error)) {
        setDialog(null)
        setConflict(true)
      } else {
        toast.error(getErrorMessage(error))
        // Bị từ chối hoặc trạng thái đã đổi: tải lại để nút chuyển trạng thái hiện đúng.
        if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) void refreshAfterWrite()
      }
    },
  })

  const register = useMutation({
    mutationFn: () => eventRepository.register(clubId, eventId),
    onSuccess: async (registration) => {
      await refreshAfterWrite()
      setJustRegistered(true)
      toast.success(
        registration.status === 'CONFIRMED'
          ? 'Đăng ký thành công, bạn đã có chỗ.'
          : `Sự kiện đã đủ chỗ. Bạn ở vị trí ${registration.waitlistPosition ?? '?'} trong danh sách chờ.`,
      )
    },
    // Dữ liệu đã đổi ở nơi khác (ví dụ đã đăng ký ở tab khác): tải lại để nút hiện đúng (NFR-REL-03).
    onError: (error) => {
      if (isConflict(error)) void refreshAfterWrite()
    },
  })

  const tabs: Array<{ value: EventTab; label: string }> = [
    { value: 'overview', label: 'Tổng quan' },
    // FR-EVT-09: BTC, ban chủ nhiệm và ban chủ nhiệm CLB đồng tổ chức xem tiến độ.
    ...(allowed.includes('VIEW_PROGRESS') ? [{ value: 'progress' as const, label: 'Tiến độ' }] : []),
    ...(allowed.includes('VIEW_STAFF') ? [{ value: 'staff' as const, label: 'Ban tổ chức' }] : []),
    { value: 'registrations', label: 'Đăng ký' },
    ...(allowed.includes('VIEW_ATTENDANCE') ? [{ value: 'attendance' as const, label: 'Điểm danh' }] : []),
    // SRS 3.5: quỹ sự kiện chỉ BTC và ban chủ nhiệm xem; máy chủ báo qua VIEW_FUND.
    ...(allowed.includes('VIEW_FUND') && event?.fundId ? [{ value: 'fund' as const, label: 'Quỹ' }] : []),
  ]
  const requestedTab = searchParams.get('tab') as EventTab | null
  const tab = tabs.some((item) => item.value === requestedTab) ? (requestedTab as EventTab) : 'overview'

  return {
    clubId,
    eventId,
    event,
    loading: detail.isPending,
    error: detail.error,
    refetch: () => void detail.refetch(),
    steps: event ? lifecycleSteps(event.status, event.statusBeforeCancel) : [],
    closeHint: event ? closeHint(event) : null,
    seats: event ? seatInfo(event) : null,
    transitions: eventTransitions(allowed),
    canManageStaff: allowed.includes('MANAGE_SUBCOMMITTEES'),
    canViewStaff: allowed.includes('VIEW_STAFF'),
    canViewProgress: allowed.includes('VIEW_PROGRESS'),
    canViewRegistrations: allowed.includes('VIEW_REGISTRATIONS'),
    canRegister: allowed.includes('REGISTER'),
    canReschedule: allowed.includes('RESCHEDULE'),
    canViewAttendance: allowed.includes('VIEW_ATTENDANCE'),
    fundId: allowed.includes('VIEW_FUND') ? (event?.fundId ?? null) : null,
    tabs,
    tab,
    setTab: (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value === 'overview') next.delete('tab')
      else next.set('tab', value)
      setSearchParams(next, { replace: true })
    },
    /** Duyệt (chọn Trưởng BTC), từ chối và hủy (bắt buộc lý do), đóng sự kiện (xác nhận) mở hộp thoại; còn lại gửi ngay. */
    requestTransition: (action: EventTransitionAction) => {
      if (transition.isPending) return
      if (needsDialog(action)) setDialog(action)
      else transition.mutate({ action })
    },
    dialog,
    closeDialog: () => {
      if (!transition.isPending) setDialog(null)
    },
    /** Ứng viên Trưởng BTC khi duyệt; người đề xuất đứng đầu nếu đủ điều kiện (FR-EVT-03). */
    leadCandidates: leadCandidates.data ?? [],
    leadCandidatesLoading: leadCandidates.isPending,
    leadCandidatesError: leadCandidates.error ? getErrorMessage(leadCandidates.error) : null,
    confirmTransition: (input: Omit<TransitionInput, 'action'>) => {
      if (dialog) transition.mutate({ action: dialog, ...input })
    },
    transitionPending: transition.isPending,
    pendingAction: transition.isPending ? (transition.variables?.action ?? null) : null,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refreshAfterWrite()
    },
    register: () => register.mutate(),
    registering: register.isPending,
    justRegistered,
  }
}

export type EventDetailViewModel = ReturnType<typeof useEventDetailViewModel>
