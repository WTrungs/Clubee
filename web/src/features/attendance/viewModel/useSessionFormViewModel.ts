import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate } from '@/shared/format/formatDate'
import { SERIES_MAX_SESSIONS } from '@/shared/lib/sessionRecurrence'
import { sessionRepository } from '../model/sessionRepository'
import type { SessionScopeOption } from '../model/sessionTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'
import { previewSeriesDays, scopeKeyOf, sessionFormSchema, toCreateSeriesRequest, toCreateSessionRequest, type SessionFormValues } from './sessionFormSchema'

const DAY_MS = 24 * 60 * 60 * 1000
const SERVER_FIELDS = ['title', 'description', 'location', 'capacity'] as const
const SERVER_RENAME = { startAt: 'startDate', endAt: 'endDate', registrationDeadline: 'deadlineDate', 'recurrence.until': 'untilDate' } as const

function defaults(scopes: readonly SessionScopeOption[], now: number): SessionFormValues {
  const day = formatDate(new Date(now + 7 * DAY_MS))
  return {
    scopeKey: scopes[0] ? scopeKeyOf(scopes[0]) : '',
    title: '',
    description: '',
    startDate: day,
    startTime: '18:00',
    endDate: day,
    endTime: '20:00',
    location: '',
    capacity: '',
    deadlineDate: '',
    deadlineTime: '',
    repeat: 'NONE',
    untilDate: '',
  }
}

/** Kết quả tạo: buổi đầu để mở trang chi tiết, kèm số buổi khi tạo chuỗi. */
interface Created {
  firstId: string
  title: string
  count: number
}

async function createSessions(clubId: string, values: SessionFormValues): Promise<Created> {
  if (values.repeat === 'NONE') {
    const session = await sessionRepository.create(clubId, toCreateSessionRequest(values))
    return { firstId: session.id, title: session.title, count: 1 }
  }
  const result = await sessionRepository.createSeries(clubId, toCreateSeriesRequest(values))
  return { firstId: result.sessions[0]?.id ?? '', title: result.sessions[0]?.title ?? values.title, count: result.sessions.length }
}

/** FR-ATT-01, FR-ATT-02: tạo buổi đơn lẻ hoặc cả chuỗi lặp trong phạm vi máy chủ cho phép; máy chủ báo đối tượng của buổi. */
export function useSessionFormViewModel(clubId: string, scopes: readonly SessionScopeOption[], onDone: () => void) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [initialNow] = useState(() => Date.now())
  const form = useForm<SessionFormValues>({ resolver: zodResolver(sessionFormSchema), defaultValues: defaults(scopes, initialNow) })
  const scopeKey = useWatch({ control: form.control, name: 'scopeKey' })
  const [repeat, startDate, startTime, untilDate] = useWatch({ control: form.control, name: ['repeat', 'startDate', 'startTime', 'untilDate'] })
  const [serverErrorsApplied, setServerErrorsApplied] = useState(false)

  const scopeLost = useRef(false)
  // Phạm vi đang chọn biến mất (ví dụ vừa mất chức): bắt chọn lại, không tự chuyển sang phạm vi khác rồi báo nhầm người.
  useEffect(() => {
    if (scopeKey === '') {
      if (!scopeLost.current && scopes[0]) form.setValue('scopeKey', scopeKeyOf(scopes[0]))
      return
    }
    if (scopes.some((scope) => scopeKeyOf(scope) === scopeKey)) return
    scopeLost.current = true
    form.setValue('scopeKey', '')
  }, [form, scopeKey, scopes])

  const mutation = useMutation({
    mutationFn: (values: SessionFormValues) => createSessions(clubId, values),
    meta: { silentError: true },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sessionLists })
      toast.success(created.count > 1 ? `Đã tạo chuỗi ${created.count} buổi “${created.title}”.` : `Đã tạo buổi “${created.title}”.`)
      onDone()
      void navigate(`/clubs/${clubId}/sessions/${created.firstId}`)
    },
    onError: (error) => {
      setServerErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      // Vừa mất quyền (ví dụ bị thu hồi chức Trưởng ban): tải lại phạm vi; sheet vẫn mở để người dùng đọc lý do.
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sessionScopes(clubId) })
    },
  })

  const error = mutation.error
  const seriesDays = previewSeriesDays({ repeat, startDate, startTime, untilDate })
  return {
    form,
    scopes,
    scopeKey,
    canSubmit: scopes.length > 0,
    repeat,
    seriesDays,
    /** Danh sách xem trước dừng ở mốc vượt giới hạn nên không biết đúng số buổi. */
    seriesTooLong: seriesDays.length > SERIES_MAX_SESSIONS,
    submit: form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined)),
    pending: form.formState.isSubmitting || mutation.isPending,
    errorMessage: error && !(serverErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
    /** Gọi khi đóng sheet: lần mở sau có ngày mặc định tính lại và không còn lỗi cũ. */
    reset: () => {
      scopeLost.current = false
      form.reset(defaults(scopes, Date.now()))
      mutation.reset()
      setServerErrorsApplied(false)
    },
  }
}
