import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import { auditLogRepository } from '../model/auditLogRepository'
import type { AuditLogQuery, AuditObjectType } from '../model/auditLogTypes'
import { AUDIT_OBJECT_TYPES } from './auditDisplay'
import { periodErrorReasons } from './reportDisplay'
import { useFileDownload } from '@/shared/hooks/useFileDownload'
import type { ExportFormat } from '@/shared/lib/exportFormat'

export const auditLogQueryKeys = {
  list: (clubId: string, query: AuditLogQuery) => ['auditLog', 'list', clubId, query] as const,
  actors: (clubId: string) => ['auditLog', 'actors', clubId] as const,
}

/** Tên tham số trên URL; khác `from`, `to` của ô chọn kỳ ở các tab báo cáo khác. */
const PARAMS = { actor: 'logActor', type: 'logType', from: 'logFrom', to: 'logTo' } as const

/** Đọc hai ô ngày dd/mm/yyyy thành khoảng yyyy-mm-dd; ô trống là không giới hạn đầu đó. */
export function parseLogRange(fromText: string, toText: string): { ok: true; from: string | null; to: string | null } | { ok: false; field: 'from' | 'to'; message: string } {
  const from = fromText.trim() ? parseVnDate(fromText) : null
  const to = toText.trim() ? parseVnDate(toText) : null
  if (fromText.trim() && !from) return { ok: false, field: 'from', message: 'Nhập ngày dạng dd/mm/yyyy.' }
  if (toText.trim() && !to) return { ok: false, field: 'to', message: 'Nhập ngày dạng dd/mm/yyyy.' }
  if (from && to && from > to) return { ok: false, field: 'to', message: 'Ngày kết thúc không trước ngày bắt đầu.' }
  return { ok: true, from, to }
}

/** FR-RPT-06: nhật ký thao tác của CLB, lọc theo người, loại đối tượng, khoảng ngày; bộ lọc nằm trên URL. */
export function useAuditLogViewModel(clubId: string) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const actorId = searchParams.get(PARAMS.actor) ?? ''
  const requestedType = searchParams.get(PARAMS.type) as AuditObjectType | null
  const objectType = requestedType && AUDIT_OBJECT_TYPES.includes(requestedType) ? requestedType : ''
  const from = searchParams.get(PARAMS.from) ?? ''
  const to = searchParams.get(PARAMS.to) ?? ''
  const [fromText, setFromText] = useState(from ? formatDate(`${from}T12:00:00+07:00`) : '')
  const [toText, setToText] = useState(to ? formatDate(`${to}T12:00:00+07:00`) : '')
  const [rangeError, setRangeError] = useState<{ field: 'from' | 'to'; message: string } | null>(null)

  const query: AuditLogQuery = { actorId: actorId || undefined, objectType: objectType || undefined, from: from || undefined, to: to || undefined, page }
  const list = useQuery({
    queryKey: auditLogQueryKeys.list(clubId, query),
    queryFn: () => auditLogRepository.list(clubId, query),
    placeholderData: keepPreviousData,
  })
  const actors = useQuery({ queryKey: auditLogQueryKeys.actors(clubId), queryFn: () => auditLogRepository.actors(clubId) })
  const write = (changes: Partial<Record<keyof typeof PARAMS, string | null>>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes) as Array<[keyof typeof PARAMS, string | null]>) {
      if (value) next.set(PARAMS[key], value)
      else next.delete(PARAMS[key])
    }
    setPage(0)
    setExpanded(null)
    setSearchParams(next, { replace: true })
    // Ô ngày luôn khớp khoảng đang lọc, để chữ gõ mà chưa áp dụng không bị tưởng là đang lọc.
    const appliedFrom = next.get(PARAMS.from)
    const appliedTo = next.get(PARAMS.to)
    setFromText(appliedFrom ? formatDate(`${appliedFrom}T12:00:00+07:00`) : '')
    setToText(appliedTo ? formatDate(`${appliedTo}T12:00:00+07:00`) : '')
    setRangeError(null)
  }
  const reasons = periodErrorReasons(list.error)

  const exporter = useFileDownload('nhat-ky')
  return {
    /** FR-RPT-07: xuất theo bộ lọc đang chọn, không theo trang. */
    exportLog: (format: ExportFormat) => exporter.download(() => auditLogRepository.export(clubId, { ...query, page: undefined }, format)),
    exporting: exporter.pending,
    actors: actors.data ?? [],
    actorsError: actors.isError,
    actorsLoading: actors.isPending,
    actorId,
    setActorId: (value: string) => write({ actor: value || null }),
    objectType,
    setObjectType: (value: string) => write({ type: value || null }),
    fromText,
    setFromText,
    toText,
    setToText,
    rangeError,
    applyRange: () => {
      const parsed = parseLogRange(fromText, toText)
      if (!parsed.ok) return setRangeError({ field: parsed.field, message: parsed.message })
      setRangeError(null)
      write({ from: parsed.from, to: parsed.to })
    },
    filtered: Boolean(actorId || objectType || from || to),
    clearFilters: () => {
      write({ actor: null, type: null, from: null, to: null })
    },
    rows: list.data?.content ?? [],
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: list.data?.size ?? 50,
    setPage: (value: number) => {
      setExpanded(null)
      setPage(value)
    },
    loading: list.isPending,
    refreshing: list.isPlaceholderData,
    error: reasons ? null : list.error,
    invalidReasons: reasons,
    refetch: () => void list.refetch(),
    expanded,
    toggle: (id: string) => setExpanded((current) => (current === id ? null : id)),
  }
}

export type AuditLogViewModel = ReturnType<typeof useAuditLogViewModel>
