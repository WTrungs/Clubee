import { Archive, ArrowRightLeft, Pencil, UserPlus, UsersRound } from 'lucide-react'
import { Link } from 'react-router'
import type { MemberSummary } from '@/features/member/model/memberTypes'
import { MemberStatusBadge } from '@/features/member/view/MemberTable'
import { formatDate } from '@/shared/format/formatDate'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { Department, Position } from '../model/orgTypes'
import { PositionList } from './PositionList'

interface DepartmentDetailProps {
  clubId: string
  department: Department
  members: MemberSummary[]
  membersLoading: boolean
  membersError: unknown
  onEdit: () => void
  onClose: () => void
  onAssign: () => void
  onTransfer: () => void
  onRevoke: (position: Position) => void
}

/** Chi tiết một ban: người phụ trách, thành viên và thao tác của ban chủ nhiệm (FR-ORG-01, 02, 03, FR-MEM-10). */
export function DepartmentDetail({ clubId, department, members, membersLoading, membersError, onEdit, onClose, onAssign, onTransfer, onRevoke }: DepartmentDetailProps) {
  const can = (action: Department['allowedActions'][number]) => department.allowedActions.includes(action)
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {/* Màn hẹp chừa chỗ cho nút đóng của Sheet ở góc trên. */}
        <div className="flex flex-wrap items-center gap-2 pr-10 lg:pr-0">
          <h2 className="text-lg font-bold">Ban {department.name}</h2>
          {department.status === 'CLOSED' && <Badge tone="neutral">Đã đóng</Badge>}
        </div>
        {department.description && <p className="text-sm text-muted-foreground">{department.description}</p>}
        {department.status === 'CLOSED' && (
          <p className="rounded-xl bg-muted/60 p-3 text-sm">
            Đóng ngày {department.closedOn ? formatDate(department.closedOn) : '—'}
            {department.closeReason && `: ${department.closeReason}`}
          </p>
        )}
      </div>

      {(can('EDIT') || can('ASSIGN_POSITION') || can('CLOSE') || can('TRANSFER_MEMBERS')) && (
        <div className="flex flex-wrap gap-2">
          {can('ASSIGN_POSITION') && (
            <Button size="sm" onClick={onAssign}>
              <UserPlus aria-hidden />
              Gán trưởng, phó ban
            </Button>
          )}
          {can('EDIT') && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil aria-hidden />
              Sửa
            </Button>
          )}
          {can('TRANSFER_MEMBERS') && (
            <Button size="sm" variant="outline" onClick={onTransfer}>
              <ArrowRightLeft aria-hidden />
              Chuyển thành viên
            </Button>
          )}
          {can('CLOSE') && (
            <Button size="sm" variant="outline" onClick={onClose}>
              <Archive aria-hidden />
              Đóng ban
            </Button>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Người phụ trách</h3>
        {department.leads.length > 0 ? (
          <PositionList positions={department.leads} show="holder" onRevoke={onRevoke} />
        ) : (
          <p className="text-sm font-semibold text-status-warning">{department.status === 'CLOSED' ? 'Không còn người phụ trách.' : 'Chưa có trưởng ban.'}</p>
        )}
      </section>

      {department.status === 'ACTIVE' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <UsersRound aria-hidden className="size-4 text-muted-foreground" />
              Thành viên ({department.memberCount})
            </h3>
            <Button size="sm" variant="link" asChild>
              <Link to={`/clubs/${clubId}/members`}>Danh sách thành viên</Link>
            </Button>
          </div>
          {membersLoading && <Skeleton className="h-24 w-full" />}
          {Boolean(membersError) && <ErrorState error={membersError} />}
          {!membersLoading && !membersError && members.length === 0 && <p className="text-sm text-muted-foreground">Ban chưa có thành viên.</p>}
          {!membersLoading && !membersError && members.length > 0 && department.memberCount > members.length && (
            <p className="text-xs text-muted-foreground">
              Hiện {members.length}/{department.memberCount} người; xem đủ ở trang Thành viên.
            </p>
          )}
          {!membersLoading && !membersError && members.length > 0 && (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.membershipId} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={member.person.fullName} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{member.person.fullName}</span>
                  <MemberStatusBadge status={member.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
