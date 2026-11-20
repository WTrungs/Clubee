import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { formatDate, parseVnDateTime } from '@/shared/format/formatDate'
import { eventRepository } from '../model/eventRepository'
import { createEventFormSchema, eventFormSchema, type EventFormValues } from './eventFormSchema'
import { eventQueryKeys } from './eventQueryKeys'

const DAY_MS = 24 * 60 * 60 * 1000
const FIELDS = ['name', 'startDate', 'endDate', 'location', 'onlineUrl', 'capacity', 'deadlineDate', 'leadUserId'] as const
const serverField: Record<string, (typeof FIELDS)[number]> = {
  name: 'name',
  startAt: 'startDate',
  endAt: 'endDate',
  location: 'location',
  onlineUrl: 'onlineUrl',
  capacity: 'capacity',
  registrationDeadline: 'deadlineDate',
  leadUserId: 'leadUserId',
}

function defaults(): EventFormValues {
  const day = formatDate(new Date(Date.now() + 14 * DAY_MS))
  return {
    name: '',
    description: '',
    startDate: day,
    startTime: '18:00',
    endDate: day,
    endTime: '21:00',
    format: 'OFFLINE',
    location: '',
    onlineUrl: '',
    capacity: '',
    deadlineDate: '',
    deadlineTime: '',
    openToGuests: false,
    leadUserId: '',
  }
}

export type EventFormMode = 'create' | 'propose'

/** FR-EVT-01 (ban chủ nhiệm tạo, chỉ định Trưởng BTC) và FR-EVT-02 (thành viên đề xuất ở Dự thảo). */
export function useEventFormViewModel(clubId: string, mode: EventFormMode, onDone: () => void) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<EventFormValues>({
    resolver: zodResolver(mode === 'create' ? createEventFormSchema : eventFormSchema),
    defaultValues: defaults(),
  })
  const [format, openToGuests] = useWatch({ control: form.control, name: ['format', 'openToGuests'] })
  const leads = useQuery({
    queryKey: eventQueryKeys.leadCandidates(clubId),
    queryFn: () => eventRepository.leadCandidates(clubId),
    enabled: mode === 'create',
  })

  const mutation = useMutation({
    mutationFn: (values: EventFormValues) =>
      eventRepository.create(clubId, {
        name: values.name,
        description: values.description,
        startAt: parseVnDateTime(values.startDate, values.startTime) ?? '',
        endAt: parseVnDateTime(values.endDate, values.endTime) ?? '',
        format: values.format,
        location: values.format === 'OFFLINE' ? values.location : null,
        onlineUrl: values.format === 'ONLINE' ? values.onlineUrl : null,
        capacity: values.capacity ? Number(values.capacity) : null,
        registrationDeadline: values.deadlineDate ? parseVnDateTime(values.deadlineDate, values.deadlineTime) : null,
        openToGuests: values.openToGuests,
        leadUserId: mode === 'create' ? values.leadUserId : null,
      }),
    meta: { silentError: true },
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.lists })
      toast.success(mode === 'create' ? `Đã tạo “${event.name}” ở trạng thái Đã duyệt.` : `Đã lưu đề xuất “${event.name}” ở Dự thảo. Gửi duyệt khi sẵn sàng.`)
      form.reset(defaults())
      onDone()
      void navigate(`/clubs/${clubId}/events/${event.id}`)
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) {
        const field = serverField[fieldError.field]
        if (field) form.setError(field, { type: 'server', message: fieldError.message })
      }
    },
  })

  const error = mutation.error
  return {
    form,
    mode,
    format,
    openToGuests,
    setFormat: (value: EventFormValues['format']) => form.setValue('format', value, { shouldValidate: form.formState.isSubmitted }),
    setOpenToGuests: (value: boolean) => form.setValue('openToGuests', value),
    leadCandidates: leads.data ?? [],
    leadsLoading: leads.isPending && mode === 'create',
    leadsError: leads.error ? getErrorMessage(leads.error) : null,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(error instanceof ApiError && error.fieldErrors.length > 0) ? getErrorMessage(error) : null,
    reset: () => {
      form.reset(defaults())
      mutation.reset()
    },
  }
}
