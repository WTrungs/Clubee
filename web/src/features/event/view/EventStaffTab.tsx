import { motion } from 'motion/react'
import { Crown, Plus, UserPlus, UsersRound } from 'lucide-react'
import { useId } from 'react'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { SearchInput } from '@/shared/ui/ListControls'
import { ProgressBar } from '@/shared/ui/ProgressBar'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { EventDetail, Subcommittee } from '../model/eventTypes'
import { useEventStaffViewModel, type EventStaffViewModel } from '../viewModel/useEventStaffViewModel'

function SubcommitteeCard({ subcommittee, onInvite }: { subcommittee: Subcommittee; onInvite: () => void }) {
  const headcount = subcommittee.members.length + (subcommittee.lead ? 1 : 0)
  const overQuota = subcommittee.quota !== null && headcount > subcommittee.quota
  return (
    <motion.li variants={itemVariants} layout className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">Tiểu ban {subcommittee.name}</h3>
          {subcommittee.description && <p className="text-sm text-muted-foreground">{subcommittee.description}</p>}
        </div>
        {subcommittee.allowedActions.includes('INVITE_MEMBER') && (
          <Button variant="outline" size="sm" onClick={onInvite}>
            <UserPlus aria-hidden />
            Mời
          </Button>
        )}
      </div>
      {subcommittee.quota !== null && (
        <div className="space-y-1.5">
          <p className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span>Chỉ tiêu nhân sự</span>
            <span className={overQuota ? 'text-status-warning' : undefined}>
              {headcount}/{subcommittee.quota}
            </span>
          </p>
          <ProgressBar value={headcount} max={subcommittee.quota} label={`${headcount} trên ${subcommittee.quota} nhân sự`} tone={overQuota ? 'warning' : 'success'} />
        </div>
      )}
      <ul className="space-y-2">
        {subcommittee.lead && (
          <li className="flex items-center gap-2.5 text-sm">
            <Avatar name={subcommittee.lead.fullName} size="sm" />
            <span className="min-w-0 flex-1 truncate font-semibold">{subcommittee.lead.fullName}</span>
            <Badge tone="progress">
              <Crown aria-hidden className="mr-1 inline size-3" />
              Trưởng tiểu ban
            </Badge>
          </li>
        )}
        {!subcommittee.lead && headcount > 0 && <li className="text-sm font-semibold text-status-warning">Chưa có trưởng tiểu ban.</li>}
        {subcommittee.members.map((member) => (
          <li key={member.id} className="flex items-center gap-2.5 text-sm">
            <Avatar name={member.fullName} size="sm" />
            <span className="min-w-0 flex-1 truncate">{member.fullName}</span>
            {member.departmentName && <span className="text-xs text-muted-foreground">Ban {member.departmentName}</span>}
          </li>
        ))}
        {headcount === 0 && <li className="text-sm text-muted-foreground">Chưa có nhân sự.</li>}
      </ul>
    </motion.li>
  )
}

function CreateSubcommitteeDialog({ staff }: { staff: EventStaffViewModel }) {
  const formId = useId()
  const { register, formState } = staff.form
  return (
    <Dialog open={staff.createOpen} onOpenChange={(open) => !open && staff.closeCreate()}>
      <DialogContent
        title="Lập tiểu ban"
        description="Tên tự đặt; không có tiểu ban con. Mỗi người làm trưởng tối đa một tiểu ban."
        footer={
          <>
            <Button variant="ghost" onClick={staff.closeCreate} disabled={staff.creating}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={staff.creating}>
              Lập tiểu ban
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={staff.submitCreate} className="space-y-4">
          <FormField label="Tên tiểu ban" required error={formState.errors.name?.message}>
            <Input placeholder="Ví dụ: Hậu cần" maxLength={80} {...register('name')} />
          </FormField>
          <FormField label="Nhiệm vụ" error={formState.errors.description?.message}>
            <Textarea rows={3} maxLength={500} {...register('description')} />
          </FormField>
          <FormField label="Chỉ tiêu nhân sự" error={formState.errors.quota?.message} hint="Để trống nếu không đặt chỉ tiêu.">
            <Input inputMode="numeric" maxLength={3} {...register('quota')} />
          </FormField>
          <FormField label="Trưởng tiểu ban" error={formState.errors.leadUserId?.message ?? staff.leadCandidatesError ?? undefined}>
            <NativeSelect disabled={staff.leadCandidatesLoading} {...register('leadUserId')}>
              <option value="">Chưa chỉ định</option>
              {staff.leadCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName}
                  {candidate.departmentName ? ` · Ban ${candidate.departmentName}` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormAlert message={staff.createError} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** FR-EVT-05: khi mời chỉ thấy tên và ban của thành viên. */
function InviteDialog({ staff }: { staff: EventStaffViewModel }) {
  const target = staff.inviteTarget
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && staff.closeInvite()}>
      <DialogContent title={`Mời vào tiểu ban ${target?.name ?? ''}`} description="Chỉ thành viên Thử việc hoặc Chính thức của CLB chủ trì.">
        <div className="space-y-3">
          <SearchInput label="Tìm thành viên" placeholder="Tìm theo tên…" value={staff.candidateKeyword} onValueChange={staff.setCandidateKeyword} />
          {staff.candidatesError ? (
            <FormAlert message={staff.candidatesError} />
          ) : staff.candidatesLoading ? (
            <div className="space-y-2" role="status" aria-label="Đang tải danh sách">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {staff.candidates.map((candidate) => {
                const already = staff.isInTarget(candidate.id)
                return (
                  <li key={candidate.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                    <Avatar name={candidate.fullName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{candidate.fullName}</span>
                      <span className="block text-xs text-muted-foreground">{candidate.departmentName ? `Ban ${candidate.departmentName}` : 'Chưa có ban'}</span>
                    </span>
                    {already ? (
                      <Badge tone="success">Đã trong tiểu ban</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={staff.invitingUserId === candidate.id}
                        disabled={staff.invitingUserId !== null}
                        onClick={() => staff.invite(candidate.id, candidate.fullName)}
                      >
                        Thêm
                      </Button>
                    )}
                  </li>
                )
              })}
              {staff.candidates.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy thành viên phù hợp.</li>}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function EventStaffTab({ event, clubId, canManage }: { event: EventDetail; clubId: string; canManage: boolean }) {
  const staff = useEventStaffViewModel(clubId, event.id, true)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersRound aria-hidden className="size-4" />
          {staff.subcommittees.length} tiểu ban · {staff.staffCount} nhân sự
          {event.lead && <> · Trưởng BTC: <span className="font-semibold text-foreground">{event.lead.fullName}</span></>}
        </p>
        {canManage && (
          <Button onClick={staff.openCreate}>
            <Plus aria-hidden />
            Lập tiểu ban
          </Button>
        )}
      </div>

      {staff.loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải ban tổ chức">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {staff.error && <ErrorState error={staff.error} onRetry={staff.refetch} />}
      {!staff.loading && !staff.error && staff.subcommittees.length === 0 && (
        <EmptyState icon={UsersRound} title="Chưa có tiểu ban" description={canManage ? 'Lập tiểu ban đầu tiên để bắt đầu phân công.' : 'Trưởng BTC chưa lập tiểu ban.'} />
      )}
      {staff.subcommittees.length > 0 && (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.subcommittees.map((subcommittee) => (
            <SubcommitteeCard key={subcommittee.id} subcommittee={subcommittee} onInvite={() => staff.openInvite(subcommittee)} />
          ))}
        </motion.ul>
      )}

      {canManage && <CreateSubcommitteeDialog staff={staff} />}
      <InviteDialog staff={staff} />
    </div>
  )
}
