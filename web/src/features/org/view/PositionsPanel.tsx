import { motion } from 'motion/react'
import { BadgeCheck, History } from 'lucide-react'
import { useId } from 'react'
import { getErrorMessage } from '@/api/apiError'
import { formatDate } from '@/shared/format/formatDate'
import { formatNumber } from '@/shared/format/formatMoney'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { Position } from '../model/orgTypes'
import { positionEndNote, positionPeriod, positionRoleLabel, positionStatusDisplay } from '../viewModel/orgDisplay'
import { usePositionsLookupViewModel, type PositionsLookupViewModel } from '../viewModel/usePositionsLookupViewModel'

function StatusBadge({ position }: { position: Position }) {
  const display = positionStatusDisplay[position.status]
  return <Badge tone={display.tone}>{display.label}</Badge>
}

function PositionTable({ positions }: { positions: Position[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">
              Người giữ
            </th>
            <th scope="col" className="px-4 py-3">
              Chức vụ
            </th>
            <th scope="col" className="px-4 py-3">
              Phạm vi
            </th>
            <th scope="col" className="px-4 py-3">
              Thời hạn
            </th>
            <th scope="col" className="px-4 py-3">
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {positions.map((position) => {
            const note = positionEndNote(position)
            return (
              <tr key={position.id} className="align-top">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={position.holder.fullName} size="sm" />
                    <span className="font-semibold">{position.holder.fullName}</span>
                  </span>
                </td>
                <td className="px-4 py-3">{positionRoleLabel[position.role]}</td>
                <td className="px-4 py-3">{position.scope.name}</td>
                <td className="px-4 py-3">
                  <span className="block tabular-nums">{positionPeriod(position)}</span>
                  {note && <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge position={position} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PositionCards({ positions }: { positions: Position[] }) {
  return (
    <motion.ul variants={listVariants} initial="initial" animate="animate" className="space-y-3">
      {positions.map((position) => {
        const note = positionEndNote(position)
        return (
          <motion.li key={position.id} variants={itemVariants} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Avatar name={position.holder.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{position.holder.fullName}</p>
                <p className="text-sm">
                  {positionRoleLabel[position.role]} · {position.scope.name}
                </p>
              </div>
              <StatusBadge position={position} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{positionPeriod(position)}</p>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </motion.li>
        )
      })}
    </motion.ul>
  )
}

function Controls({ vm }: { vm: PositionsLookupViewModel }) {
  const termSelectId = useId()
  return (
    <div className="space-y-3">
      <div className={vm.termFixed ? 'grid grid-cols-1' : 'grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-end'}>
        {!vm.termFixed && (
          <div className="space-y-1.5">
            <label htmlFor={termSelectId} className="text-sm font-semibold">
              Nhiệm kỳ
            </label>
            <NativeSelect id={termSelectId} value={vm.termId} onChange={(event) => vm.setTermId(event.target.value)}>
              {vm.termOptions.map((option) => (
                <option key={option.value || 'current'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <SearchInput label="Tìm theo tên người, ban hoặc sự kiện" placeholder="Tìm theo tên người, ban, sự kiện…" value={vm.keyword} onValueChange={vm.setKeyword} />
      </div>
      {vm.termsError !== null && !vm.termFixed && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>Chưa tải được danh sách nhiệm kỳ đã đóng. {getErrorMessage(vm.termsError)}</span>
          <Button size="sm" variant="outline" onClick={vm.retryTerms}>
            Thử lại
          </Button>
        </div>
      )}
      <div role="group" aria-label="Lọc theo phạm vi" className="flex flex-wrap gap-2">
        {vm.scopeFilters.map((filter) => (
          <FilterChip key={filter.value || 'all'} label={filter.label} selected={vm.scopeType === filter.value} onToggle={() => vm.setScopeType(filter.value)} />
        ))}
      </div>
    </div>
  )
}

/** FR-ORG-06: ai đang giữ chức gì; chọn nhiệm kỳ đã đóng để xem chức vụ thường trực của nhiệm kỳ đó. */
export function PositionsPanel({ active, termId }: { active: boolean; termId?: string }) {
  const vm = usePositionsLookupViewModel(active, termId)
  const wide = useMediaQuery('(min-width: 768px)')
  return (
    <div className="space-y-4">
      <Controls vm={vm} />
      {vm.closedTerm && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <History aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {vm.closedTerm.name} ({formatDate(vm.closedTerm.startOn)} – {formatDate(vm.closedTerm.endOn)}) đã đóng. Tên ban theo lúc nhiệm kỳ đóng; chỉ
          gồm chức vụ thường trực.
        </p>
      )}
      {vm.loading && (
        <div className="space-y-2.5" role="status" aria-label="Đang tải chức vụ">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.positions.length === 0 && (
        <EmptyState
          icon={BadgeCheck}
          title="Không có chức vụ phù hợp"
          description={vm.keyword || vm.scopeType ? 'Thử từ khóa khác hoặc bỏ bộ lọc phạm vi.' : 'Nhiệm kỳ này chưa ghi nhận chức vụ nào.'}
        />
      )}
      {!vm.loading && !vm.error && vm.positions.length > 0 && (
        <div aria-busy={vm.refreshing || undefined} className={cn('space-y-4 transition-opacity duration-200', vm.refreshing && 'opacity-60')}>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {formatNumber(vm.totalElements)} chức vụ
          </p>
          {wide ? <PositionTable positions={vm.positions} /> : <PositionCards positions={vm.positions} />}
        </div>
      )}
      {!vm.error && <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />}
    </div>
  )
}
