import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { useNow } from '@/shared/hooks/useNow'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef, AttendanceFilter, AttendanceRecord, AttendanceRow, AttendanceSheet, AttendanceSheetQuery, AttendanceStatus } from '../model/attendanceTypes'
import { attendanceStatusDisplay, attendanceWindow } from './attendanceDisplay'
import { attendanceQueryKeys } from './attendanceQueryKeys'

const PAGE_SIZE = 50
const MAX_WAIT_MS = 60_000
/** Khi đang chiếu mã QR, số người đã quét tải lại theo nhịp này. */
const QR_REFRESH_MS = 10_000

export interface MarkVariables {
  userId: string
  fullName: string
  status: AttendanceStatus
  /** Phiên bản bản ghi đang thấy; 0 khi người này chưa có bản ghi. */
  version: number
  day: string | null
}

/** Người đang được sửa sau khi chốt (FR-ATT-08); `record` là `null` khi người này chưa có bản ghi (nhập lại từ danh sách giấy). */
export interface EditTarget {
  userId: string
  fullName: string
  record: AttendanceRecord | null
}

/** Chưa tới giờ mở thì tự tải lại đúng lúc mở, để nút điểm danh hiện ra mà không cần tải lại trang. */
function untilOpen(sheet: AttendanceSheet | undefined): number | false {
  if (!sheet || sheet.readOnlyReason) return false
  // Đã chốt: tải lại đúng lúc hết hạn sửa để nút Sửa và câu báo khớp máy chủ (FR-ATT-08).
  if (sheet.closedAt) {
    const left = sheet.editableUntil && sheet.allowedActions.includes('EDIT') ? Date.parse(sheet.editableUntil) - Date.now() : 0
    return left > 0 ? Math.min(Math.max(left + 500, 1000), MAX_WAIT_MS) : false
  }
  const wait = Date.parse(sheet.opensAt) - Date.now()
  return wait > 0 ? Math.min(Math.max(wait + 500, 1000), MAX_WAIT_MS) : false
}

/** Thay dòng vừa ghi bằng bản máy chủ đã lưu; dòng chưa có trong trang đang xem thì để lần tải lại thêm vào. */
function withRow(sheet: AttendanceSheet | undefined, day: string | null, row: AttendanceRow): AttendanceSheet | undefined {
  if (!sheet || sheet.day !== day) return sheet
  return { ...sheet, rows: { ...sheet.rows, content: sheet.rows.content.map((item) => (item.person.id === row.person.id ? row : item)) } }
}

/** FR-ATT-07 (điểm danh tay, người phát sinh) và phần chốt của FR-ATT-08, dùng chung cho buổi sinh hoạt và sự kiện. */
export function useAttendanceViewModel(activity: AttendanceActivityRef) {
  const queryClient = useQueryClient()
  const now = useNow(15_000)
  const [day, setDay] = useState<string | undefined>()
  const [filter, setFilter] = useState<AttendanceFilter | ''>('')
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const [conflict, setConflict] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [extraOpen, setExtraOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeNotice, setCloseNotice] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [historyRow, setHistoryRow] = useState<AttendanceRow | null>(null)

  const query: AttendanceSheetQuery = { day, q: debouncedKeyword || undefined, status: filter || undefined, page, size: PAGE_SIZE }
  const sheetQuery = useQuery({
    queryKey: attendanceQueryKeys.sheet(activity, query),
    queryFn: () => attendanceRepository.sheet(activity, query),
    placeholderData: keepPreviousData,
    refetchInterval: (current) => (qrOpen ? QR_REFRESH_MS : untilOpen(current.state.data)),
  })
  const sheet = sheetQuery.data ?? null
  const sheetsKey = attendanceQueryKeys.sheets(activity)
  const refreshSheets = () => queryClient.invalidateQueries({ queryKey: sheetsKey })
  const refreshCandidates = () => queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.candidatesOf(activity) })
  // Ghi dòng máy chủ đã lưu (không phải cập nhật lạc quan) để dòng vẫn đúng khi lần tải lại sau đó lỗi.
  const applyRow = (row: AttendanceRow, rowDay: string | null) => queryClient.setQueriesData<AttendanceSheet>({ queryKey: sheetsKey }, (old) => withRow(old, rowDay, row))

  const markKey = ['attendance', 'mark', activity.type, activity.id] as const
  const mark = useMutation({
    mutationKey: markKey,
    mutationFn: (variables: MarkVariables) =>
      attendanceRepository.mark(activity, variables.userId, { day: variables.day, status: variables.status, version: variables.version }),
    meta: { silentError: true },
    onSuccess: async (row, variables) => {
      applyRow(row, variables.day)
      setAnnouncement(`Đã ghi ${attendanceStatusDisplay[variables.status].label} cho ${variables.fullName}.`)
      await refreshSheets()
    },
    onError: (error) => {
      if (isConflict(error)) setConflict(true)
      else toast.error(getErrorMessage(error))
      void refreshSheets()
    },
  })
  const pendingUserIds = useMutationState({
    filters: { mutationKey: markKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as MarkVariables | undefined)?.userId,
  })

  const addExtra = useMutation({
    mutationFn: (variables: Omit<MarkVariables, 'status' | 'version'>) =>
      attendanceRepository.mark(activity, variables.userId, { day: variables.day, status: 'PRESENT', version: 0 }),
    meta: { silentError: true },
    onSuccess: async (_row, variables) => {
      setAnnouncement(`Đã thêm ${variables.fullName} và ghi Có mặt.`)
      setExtraOpen(false)
      await Promise.all([refreshSheets(), refreshCandidates()])
    },
    // Người đó vừa được điểm danh ở nơi khác (409) hoặc lỗi khác: tải lại để danh sách và ứng viên khớp máy chủ.
    onError: () => void Promise.all([refreshSheets(), refreshCandidates()]),
  })

  // FR-ATT-08: sửa sau khi chốt, kèm lý do; lỗi hiện trong hộp để người dùng sửa lại lý do hoặc tải lại.
  const editRecord = useMutation({
    mutationFn: ({ target, status, reason }: { target: EditTarget; status: AttendanceStatus; reason: string }) =>
      attendanceRepository.mark(activity, target.userId, { day: sheet?.day ?? null, status, reason, version: target.record?.version ?? 0 }),
    meta: { silentError: true },
    onSuccess: async (row, { target, status }) => {
      applyRow(row, sheet?.day ?? null)
      setEditTarget(null)
      toast.success(`Đã sửa thành ${attendanceStatusDisplay[status].label} cho ${target.fullName}.`)
      await Promise.all([refreshSheets(), refreshCandidates()])
    },
    onError: (error) => {
      if (isConflict(error)) {
        setEditTarget(null)
        setConflict(true)
      }
      void refreshSheets()
    },
  })

  const close = useMutation({
    mutationFn: (current: AttendanceSheet) => attendanceRepository.close(activity, { action: 'CLOSE', day: current.day, version: current.version }),
    meta: { silentError: true },
    onSuccess: async (after, before) => {
      const marked = after.counts.absent - before.counts.absent
      toast.success(marked > 0 ? `Đã chốt điểm danh, ${marked} người được ghi Vắng không phép.` : 'Đã chốt điểm danh.')
      setCloseOpen(false)
      await Promise.all([refreshSheets(), queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sessions })])
    },
    onError: (error) => {
      // Danh sách vừa đổi: tải lại để số người trong hộp xác nhận đúng với lúc chốt.
      if (isConflict(error)) setCloseNotice('Danh sách vừa thay đổi. Kiểm tra lại số người trước khi chốt.')
      void refreshSheets()
    },
  })

  const allowed = sheet?.allowedActions ?? []
  const extraError = addExtra.error
    ? isConflict(addExtra.error)
      ? 'Người này vừa được điểm danh ở nơi khác. Danh sách đã được tải lại.'
      : getErrorMessage(addExtra.error)
    : null
  return {
    sheet,
    loading: sheetQuery.isPending,
    error: sheetQuery.error,
    refetch: () => void sheetQuery.refetch(),
    window: sheet ? attendanceWindow(sheet, now) : null,
    now,
    day: sheet?.day ?? null,
    days: sheet?.days ?? [],
    setDay: (value: string) => {
      setDay(value)
      setPage(0)
    },
    filter,
    setFilter: (value: AttendanceFilter | '') => {
      setFilter(value)
      setPage(0)
    },
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    page: sheet?.rows.page ?? 0,
    totalPages: sheet?.rows.totalPages ?? 0,
    totalElements: sheet?.rows.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    canMark: allowed.includes('MARK'),
    canShowQr: allowed.includes('SHOW_QR'),
    canClose: allowed.includes('CLOSE'),
    canEdit: allowed.includes('EDIT'),
    editTarget,
    openEdit: (target: EditTarget) => {
      editRecord.reset()
      setExtraOpen(false)
      setEditTarget(target)
    },
    closeEdit: () => {
      if (!editRecord.isPending) setEditTarget(null)
    },
    submitEdit: (status: AttendanceStatus, reason: string) => {
      if (editTarget) editRecord.mutate({ target: editTarget, status, reason })
    },
    editPending: editRecord.isPending,
    editError: editRecord.error && !isConflict(editRecord.error) ? getErrorMessage(editRecord.error) : null,
    historyRow,
    setHistoryRow,
    qrOpen,
    setQrOpen,
    /** Lỗi đã được báo trong onError nên promise không bao giờ bị từ chối. */
    markStatus: (variables: Omit<MarkVariables, 'day'>) => mark.mutateAsync({ ...variables, day: sheet?.day ?? null }).catch(() => undefined),
    pendingUserIds: new Set(pendingUserIds.filter((userId): userId is string => Boolean(userId))),
    announcement,
    conflict,
    reloadAfterConflict: () => {
      setConflict(false)
      void refreshSheets()
    },
    extraOpen,
    setExtraOpen: (open: boolean) => {
      if (addExtra.isPending) return
      addExtra.reset()
      setExtraOpen(open)
    },
    addExtra: (userId: string, fullName: string) => addExtra.mutate({ userId, fullName, day: sheet?.day ?? null }),
    extraPendingId: addExtra.isPending ? (addExtra.variables?.userId ?? null) : null,
    extraError,
    closeOpen,
    openClose: () => {
      close.reset()
      setCloseNotice(null)
      setCloseOpen(true)
    },
    setCloseOpen: (open: boolean) => {
      if (!close.isPending) setCloseOpen(open)
    },
    confirmClose: () => {
      if (!sheet) return
      setCloseNotice(null)
      close.mutate(sheet)
    },
    closePending: close.isPending,
    closeError: closeNotice ?? (close.error && !isConflict(close.error) ? getErrorMessage(close.error) : null),
  }
}

export type AttendanceViewModel = ReturnType<typeof useAttendanceViewModel>
