import { FilterX } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { FilterChip, SearchInput } from '@/shared/ui/ListControls'
import type { MemberRoleFilter } from '../model/memberTypes'
import { LISTABLE_STATUSES, memberStatusDisplay, roleFilterOptions } from '../viewModel/memberDisplay'
import type { MemberListViewModel } from '../viewModel/useMemberListViewModel'

/** Lọc theo trạng thái, ban, chức vụ, năm gia nhập (FR-MEM-04). */
export function MemberFiltersBar({ vm }: { vm: MemberListViewModel }) {
  return (
    <div className="mb-5 space-y-3">
      <SearchInput
        label="Tìm thành viên"
        placeholder={vm.canManage ? 'Tìm theo tên, email, MSSV…' : 'Tìm theo tên…'}
        value={vm.keyword}
        onValueChange={vm.setKeyword}
        className="sm:max-w-md"
      />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <NativeSelect aria-label="Lọc theo ban" value={vm.departmentId} onChange={(event) => vm.setDepartmentId(event.target.value)} className="sm:w-48">
          <option value="">Mọi ban</option>
          {vm.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.closed ? `${department.name} (đã đóng)` : department.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo chức vụ" value={vm.role} onChange={(event) => vm.setRole(event.target.value as MemberRoleFilter | '')} className="sm:w-48">
          <option value="">Mọi chức vụ</option>
          {roleFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo năm gia nhập" value={vm.joinYear} onChange={(event) => vm.setJoinYear(event.target.value)} className="sm:w-44">
          <option value="">Mọi năm</option>
          {vm.joinYears.map((year) => (
            <option key={year} value={String(year)}>
              Năm {year}
            </option>
          ))}
        </NativeSelect>
        {vm.activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={vm.clearFilters} className="justify-self-start">
            <FilterX aria-hidden />
            Xóa bộ lọc
          </Button>
        )}
      </div>
      {vm.facetsError && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-status-danger">
          Không tải được danh sách ban, năm gia nhập để lọc: {vm.facetsError}
          <Button variant="link" size="sm" onClick={vm.retryFacets}>
            Thử lại
          </Button>
        </p>
      )}
      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {LISTABLE_STATUSES.map((status) => (
          <FilterChip key={status} label={memberStatusDisplay[status].label} selected={vm.statuses.includes(status)} onToggle={() => vm.toggleStatus(status)} />
        ))}
      </div>
    </div>
  )
}
