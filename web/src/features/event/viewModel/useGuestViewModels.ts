import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { getErrorMessage } from '@/api/apiError'
import { USE_MOCK } from '@/api/mockMode'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { GUEST_NAME_MAX, GUEST_NAME_MIN, parseGuestContact } from '@/shared/lib/guestRules'
import { eventRepository } from '../model/eventRepository'
import type { GuestPass, GuestRegistrationRow } from '../model/eventTypes'
import { publicEventRepository } from '../model/publicEventRepository'
import { publicEventQueryKeys } from './usePublicEventViewModel'

export const guestFormSchema = z
  .object({
    fullName: z.string().trim().min(GUEST_NAME_MIN, `Họ tên cần ít nhất ${GUEST_NAME_MIN} ký tự.`).max(GUEST_NAME_MAX, `Họ tên tối đa ${GUEST_NAME_MAX} ký tự.`),
    email: z.string(),
    phone: z.string(),
  })
  .superRefine((values, context) => {
    // Cùng quy tắc với máy chủ: email hoặc SĐT hợp lệ, ít nhất một trong hai.
    for (const error of parseGuestContact(values).errors.filter((item) => item.field !== 'fullName')) {
      context.addIssue({ code: 'custom', path: [error.field], message: error.message })
    }
  })
export type GuestFormValues = z.infer<typeof guestFormSchema>

/** Chế độ mock không gửi email thật: lấy thư vừa gửi từ hộp thư demo; bản build thật không chạy nhánh này. */
async function demoGuestMail(email: string): Promise<{ subject: string; body: string } | null | undefined> {
  if (!USE_MOCK || email.trim() === '') return undefined
  const { latestGuestMailFor } = await import('@/api/mocks/mockGuests')
  const mail = latestGuestMailFor(email)
  return mail ? { subject: mail.subject, body: mail.body } : null
}

/** FR-EVT-12: khách mời đăng ký bằng họ tên và email hoặc SĐT; xong thì hiện mã tham dự dạng QR. */
export function useGuestRegistrationViewModel(eventId: string) {
  const queryClient = useQueryClient()
  const form = useForm<GuestFormValues>({ resolver: zodResolver(guestFormSchema), defaultValues: { fullName: '', email: '', phone: '' } })
  const mutation = useMutation({
    mutationFn: async (values: GuestFormValues) => {
      const pass = await publicEventRepository.registerGuest(eventId, {
        fullName: values.fullName,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
      })
      return { pass, mail: await demoGuestMail(values.email) }
    },
    meta: { silentError: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: publicEventQueryKeys.detail(eventId) }),
    onError: (error) => applyServerFieldErrors(error, form.setError, ['fullName', 'email', 'phone']),
  })
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    pass: mutation.data?.pass ?? null,
    /** Chỉ có ở chế độ mock: `undefined` là không có hộp thư demo. */
    demoMail: mutation.data?.mail,
  }
}

export const guestPassPath = (code: string) => `/guest-pass/${encodeURIComponent(code)}`

/** Câu trạng thái trên vé của khách. */
export function guestPassStatusText(pass: Pick<GuestPass, 'status' | 'waitlistPosition'>): string {
  if (pass.status === 'CANCELLED') return 'Đã hủy đăng ký'
  if (pass.status === 'WAITLISTED') return `Danh sách chờ, vị trí ${pass.waitlistPosition ?? '?'}`
  return 'Đã nhận chỗ'
}

/** Vé của khách mở từ email: xem mã QR, trạng thái và tự hủy khi còn hạn. */
export function useGuestPassViewModel(code: string) {
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const pass = useQuery({ queryKey: ['guestPass', code], queryFn: () => publicEventRepository.pass(code) })
  const cancel = useMutation({
    mutationFn: () => publicEventRepository.cancelPass(code),
    meta: { silentError: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(['guestPass', code], saved)
      setConfirmCancel(false)
      toast.success('Đã hủy đăng ký.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return {
    pass: pass.data ?? null,
    loading: pass.isPending,
    error: pass.error,
    refetch: () => void pass.refetch(),
    canCancel: pass.data?.allowedActions.includes('CANCEL') ?? false,
    confirmCancel,
    setConfirmCancel,
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  }
}

/** FR-ATT-07: BTC tra khách mời theo mã, email hoặc SĐT, ghi có mặt cho ngày đang chọn ở bảng điểm danh. */
export function useGuestCheckInViewModel(clubId: string, eventId: string, day: string | null) {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const q = useDebouncedValue(keyword.trim())
  const key = ['guestRegistrations', clubId, eventId, day, q] as const
  const list = useQuery({ queryKey: key, queryFn: () => eventRepository.guestRegistrations(clubId, eventId, { q: q || undefined, day }) })
  const checkIn = useMutation({
    mutationFn: (row: GuestRegistrationRow) => eventRepository.checkInGuest(clubId, eventId, row.id, day),
    meta: { silentError: true },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['guestRegistrations', clubId, eventId] })
      toast.success(`Đã ghi có mặt: ${saved.fullName}.`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return {
    keyword,
    setKeyword,
    rows: list.data ?? [],
    loading: list.isPending,
    error: list.error,
    retry: () => void list.refetch(),
    checkIn: (row: GuestRegistrationRow) => checkIn.mutate(row),
    checkingId: checkIn.isPending ? (checkIn.variables?.id ?? null) : null,
  }
}
