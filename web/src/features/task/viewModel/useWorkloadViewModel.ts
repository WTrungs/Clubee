import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { taskRepository } from '../model/taskRepository'
import type { WorkloadRow, WorkloadScope } from '../model/taskTypes'
import { taskQueryKeys } from './taskQueryKeys'

/** Khóa của phạm vi trong ô chọn: `CLUB`, hoặc `DEPARTMENT:mã`, `EVENT:mã`. */
export const workloadScopeKey = (scope: Pick<WorkloadScope, 'type' | 'id'>) => (scope.type === 'CLUB' ? 'CLUB' : `${scope.type}:${scope.id ?? ''}`)

/** Tổng của bảng: việc đang làm, quá hạn, số người có việc quá hạn. */
export function workloadSummary(rows: readonly WorkloadRow[]): { open: number; overdue: number; peopleOverdue: number } {
  return {
    open: rows.reduce((sum, row) => sum + row.open, 0),
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    peopleOverdue: rows.filter((row) => row.overdue > 0).length,
  }
}

/** FR-TASK-08: khối lượng việc theo người trong phạm vi người dùng quản lý; mặc định phạm vi đầu tiên. */
export function useWorkloadViewModel(clubId: string, active: boolean) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const scopes = useQuery({ queryKey: taskQueryKeys.workloadScopes(clubId), queryFn: () => taskRepository.workloadScopes(clubId), enabled: active })
  const options = scopes.data ?? []
  const scope = options.find((candidate) => workloadScopeKey(candidate) === selectedKey) ?? options[0] ?? null
  const workload = useQuery({
    queryKey: taskQueryKeys.workload(clubId, scope ?? { type: 'CLUB', id: null }),
    queryFn: () => taskRepository.workload(clubId, scope ?? { type: 'CLUB', id: null }),
    enabled: active && scope !== null,
    placeholderData: keepPreviousData,
  })
  const rows = workload.data?.rows ?? []
  return {
    scopes: options,
    scopeKey: scope ? workloadScopeKey(scope) : '',
    setScopeKey: setSelectedKey,
    scopeName: scope?.name ?? '',
    rows,
    summary: workloadSummary(rows),
    loading: scopes.isPending || (scope !== null && workload.isPending),
    /** Đang tải phạm vi mới mà còn hiện số của phạm vi cũ. */
    stale: workload.isPlaceholderData,
    error: scopes.error ?? workload.error,
    retry: () => void (scopes.error ? scopes.refetch() : workload.refetch()),
    noScope: scopes.isSuccess && options.length === 0,
  }
}
