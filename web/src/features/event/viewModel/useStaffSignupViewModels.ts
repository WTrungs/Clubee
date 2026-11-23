import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { eventRepository } from '../model/eventRepository'
import type { EventDetail, PendingStaffSignup, SignupSubcommittee } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

/** Câu mô tả số người so với chỉ tiêu của một tiểu ban. */
export function signupQuotaText(subcommittee: Pick<SignupSubcommittee, 'quota' | 'memberCount' | 'full'>): string {
  if (subcommittee.quota === null) return `${subcommittee.memberCount} người, không đặt chỉ tiêu`
  return subcommittee.full ? `Đủ chỉ tiêu ${subcommittee.memberCount}/${subcommittee.quota}` : `${subcommittee.memberCount}/${subcommittee.quota} người`
}

/** FR-EVT-06: thành viên CLB chủ trì tự vào tiểu ban khi BTC mở đăng ký; đủ chỉ tiêu thì gửi yêu cầu kèm lời nhắn. */
export function useStaffSignupViewModel(event: EventDetail) {
  const queryClient = useQueryClient()
  const { clubId, id: eventId } = event
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const info = useQuery({ queryKey: eventQueryKeys.staffSignup(clubId, eventId), queryFn: () => eventRepository.staffSignup(clubId, eventId), enabled: event.staffSignupOpen })
  const selected = info.data?.subcommittees.find((subcommittee) => subcommittee.id === selectedId) ?? null
  const needsNote = selected?.full ?? false
  const trimmed = note.trim()
  const mutation = useMutation({
    mutationFn: () => eventRepository.signUpStaff(clubId, eventId, { subcommitteeId: selectedId ?? '', note: needsNote ? trimmed : undefined }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(eventQueryKeys.staffSignup(clubId, eventId), saved)
      void queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      void queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) })
      toast.success(saved.mySubcommitteeName ? `Bạn đã vào tiểu ban ${saved.mySubcommitteeName}.` : 'Đã gửi yêu cầu cho Trưởng BTC.')
      setSelectedId(null)
      setNote('')
      setTouched(false)
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: eventQueryKeys.staffSignup(clubId, eventId) }),
  })
  return {
    visible: event.staffSignupOpen && info.data !== undefined && (info.data.canSignUp || info.data.mySubcommitteeName !== null || info.data.myRequest?.status === 'PENDING'),
    info: info.data ?? null,
    selectedId,
    select: (id: string) => {
      setSelectedId(id)
      mutation.reset()
    },
    needsNote,
    note,
    setNote,
    noteMax: REASON_MAX,
    noteError: touched && needsNote && trimmed.length < REASON_MIN ? `Nhập lời nhắn ít nhất ${REASON_MIN} ký tự.` : undefined,
    selectError: touched && selectedId === null ? 'Chọn một tiểu ban.' : undefined,
    submit: () => {
      setTouched(true)
      if (selectedId === null || (needsNote && trimmed.length < REASON_MIN)) return
      mutation.mutate()
    },
    pending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
  }
}

/** BTC mở, đóng đăng ký nhân sự; Trưởng BTC duyệt hoặc từ chối yêu cầu vượt chỉ tiêu (BR-EVT-07). */
export function useStaffSignupAdminViewModel(event: EventDetail, canManage: boolean) {
  const queryClient = useQueryClient()
  const { clubId, id: eventId } = event
  const canDecide = event.allowedActions.includes('DECIDE_STAFF_REQUESTS')
  const [rejecting, setRejecting] = useState<PendingStaffSignup | null>(null)
  const requests = useQuery({ queryKey: eventQueryKeys.staffSignupRequests(clubId, eventId), queryFn: () => eventRepository.staffSignupRequests(clubId, eventId), enabled: canDecide })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: eventQueryKeys.staffSignupRequests(clubId, eventId) })
    void queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
  }
  const toggle = useMutation({
    mutationFn: (open: boolean) => eventRepository.setStaffSignup(clubId, eventId, { open, version: event.version }),
    meta: { silentError: true },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) })
      toast.success(saved.open ? 'Đã mở cho thành viên tự đăng ký.' : 'Đã đóng đăng ký nhân sự.')
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isConflict(error)) void queryClient.invalidateQueries({ queryKey: eventQueryKeys.detail(clubId, eventId) })
    },
  })
  const approve = useMutation({
    mutationFn: (request: PendingStaffSignup) => eventRepository.approveStaffSignup(clubId, eventId, request.id),
    meta: { silentError: true },
    onSuccess: (saved) => {
      refresh()
      toast.success(`Đã nhận ${saved.person.fullName} vào tiểu ban ${saved.subcommitteeName}.`)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 422) refresh()
    },
  })
  const reject = useMutation({
    mutationFn: ({ request, reason }: { request: PendingStaffSignup; reason: string }) => eventRepository.rejectStaffSignup(clubId, eventId, request.id, reason),
    meta: { silentError: true },
    onSuccess: () => {
      setRejecting(null)
      refresh()
      toast.success('Đã từ chối yêu cầu.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return {
    canToggle: canManage,
    open: event.staffSignupOpen,
    toggle: (open: boolean) => toggle.mutate(open),
    toggling: toggle.isPending,
    canDecide,
    requests: requests.data ?? [],
    approve: (request: PendingStaffSignup) => approve.mutate(request),
    approvingId: approve.isPending ? (approve.variables?.id ?? null) : null,
    rejecting,
    setRejecting,
    reject: (reason: string) => rejecting && reject.mutate({ request: rejecting, reason }),
    rejectPending: reject.isPending,
  }
}
