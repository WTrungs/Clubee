import { motion } from 'motion/react'
import { Crown, Handshake, Plus, UserCog, UserPlus, UsersRound } from 'lucide-react'
import { useId } from 'react'
import { REASON_MAX } from '@/shared/lib/reasonRules'
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
import type { CoHost, EventDetail, StaffMember, Subcommittee } from '../model/eventTypes'
import { useAddCollaboratorViewModel, type AddCollaboratorViewModel } from '../viewModel/useAddCollaboratorViewModel'
import { useCoHostsViewModel } from '../viewModel/useCoHostsViewModel'
import { useEventStaffViewModel, type EventStaffViewModel } from '../viewModel/useEventStaffViewModel'
import { useSetLeadViewModel, type SetLeadViewModel } from '../viewModel/useSetLeadViewModel'
import { CoHostSection } from './CoHostSection'
import { StaffSignupAdmin } from './StaffSignupAdmin'

/** Nhãn cạnh tên: CTV, CLB gốc của nhân sự CLB đồng tổ chức, hoặc ban ở CLB chủ trì. */
function StaffTag({ member }: { member: StaffMember }) {
  if (member.kind === 'COLLABORATOR') {
    return (
      <Badge tone="neutral" title="Cộng tác viên, người ngoài CLB">
        CTV
      </Badge>
    )
  }
  if (member.kind === 'CO_HOST') {
    return (
      <Badge tone="info" title={`Nhân sự CLB đồng tổ chức: ${member.homeClubName ?? ''}`} className="max-w-36 truncate">
        {member.homeClubName}
      </Badge>
    )
  }
  return member.departmentName ? <span className="text-xs text-muted-foreground">Ban {member.departmentName}</span> : null
}

interface SubcommitteeCardProps {
  subcommittee: Subcommittee
  onInvite: () => void
  onAddCollaborator: () => void
  onSetLead: () => void
}

function SubcommitteeCard({ subcommittee, onInvite, onAddCollaborator, onSetLead }: SubcommitteeCardProps) {
  const headcount = subcommittee.members.length + (subcommittee.lead ? 1 : 0)
  const overQuota = subcommittee.quota !== null && headcount > subcommittee.quota
  return (
    // min-w-0: thẻ là ô lưới, tên dài kèm nhãn CLB gốc không được kéo thẻ rộng quá cột ở màn hẹp.
    <motion.li variants={itemVariants} layout className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      {/* Nút xếp dưới tên: thẻ chỉ rộng khoảng 320 px ở màn hẹp và lưới 3 cột, đặt cạnh tên thì tên bị ép mỗi dòng một chữ. */}
      <div className="space-y-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">Tiểu ban {subcommittee.name}</h3>
          {subcommittee.description && <p className="text-sm text-muted-foreground">{subcommittee.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2 empty:hidden">
          {subcommittee.allowedActions.includes('INVITE_MEMBER') && (
            <Button variant="outline" size="sm" onClick={onInvite} aria-label={`Mời thành viên vào tiểu ban ${subcommittee.name}`}>
              <UserPlus aria-hidden />
              Mời
            </Button>
          )}
          {subcommittee.allowedActions.includes('ADD_COLLABORATOR') && (
            <Button variant="outline" size="sm" onClick={onAddCollaborator} aria-label={`Thêm CTV vào tiểu ban ${subcommittee.name}`}>
              <Handshake aria-hidden />
              Thêm CTV
            </Button>
          )}
          {subcommittee.allowedActions.includes('SET_LEAD') && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSetLead}
              aria-label={`${subcommittee.lead ? 'Đổi trưởng' : 'Chọn trưởng'} tiểu ban ${subcommittee.name}`}
            >
              <UserCog aria-hidden />
              {subcommittee.lead ? 'Đổi trưởng' : 'Chọn trưởng'}
            </Button>
          )}
        </div>
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
            {subcommittee.lead.kind === 'CO_HOST' && <StaffTag member={subcommittee.lead} />}
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
            {member.overQuota && (
              <Badge tone="warning" title="Trưởng BTC duyệt vào vượt chỉ tiêu">
                Vượt chỉ tiêu
              </Badge>
            )}
            <StaffTag member={member} />
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

/** FR-EVT-05: khi mời chỉ thấy tên và ban của thành viên; FR-EVT-08: chọn nguồn là CLB đồng tổ chức đang Chấp nhận. */
function InviteDialog({ staff, coHosts }: { staff: EventStaffViewModel; coHosts: CoHost[] }) {
  const target = staff.inviteTarget
  const sources = target?.allowedActions.includes('ADD_CO_HOST_STAFF') ? coHosts : []
  const sourceName = sources.find((coHost) => coHost.id === staff.inviteSource)?.club.name
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && staff.closeInvite()}>
      <DialogContent
        title={`Mời vào tiểu ban ${target?.name ?? ''}`}
        description={sourceName ? `Thành viên Thử việc hoặc Chính thức của ${sourceName}.` : 'Chỉ thành viên Thử việc hoặc Chính thức của CLB chủ trì.'}
      >
        <div className="space-y-3">
          {sources.length > 0 && (
            <FormField label="Nguồn nhân sự">
              <NativeSelect value={staff.inviteSource ?? ''} onChange={(event) => staff.setInviteSource(event.target.value || null)}>
                <option value="">Thành viên CLB chủ trì</option>
                {sources.map((coHost) => (
                  <option key={coHost.id} value={coHost.id}>
                    {coHost.club.name} (đồng tổ chức)
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
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

/** FR-EVT-07: chỉ nhập email tài khoản, không gợi ý theo email để không dò được tài khoản. */
function AddCollaboratorDialog({ vm }: { vm: AddCollaboratorViewModel }) {
  const formId = useId()
  const { register, formState } = vm.form
  return (
    <Dialog open={vm.target !== null} onOpenChange={(open) => !open && vm.close()}>
      <DialogContent
        title={`Thêm cộng tác viên vào tiểu ban ${vm.target?.name ?? ''}`}
        description="Người ngoài CLB, đã có tài khoản Clubee. Họ vào tiểu ban ngay, nhận thông báo và chỉ xem được sự kiện này. Cộng tác viên không làm trưởng tiểu ban."
        footer={
          <>
            <Button variant="ghost" onClick={vm.close} disabled={vm.submitting}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.submitting}>
              Thêm cộng tác viên
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
          <FormField label="Email tài khoản" required error={formState.errors.email?.message} hint="Thành viên CLB thì dùng nút Mời.">
            <Input type="email" inputMode="email" autoComplete="off" maxLength={254} placeholder="ten@example.com" {...register('email')} />
          </FormField>
          <FormAlert message={vm.formError} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Đổi trưởng tiểu ban: chọn trong nhân sự hiện có (không phải CTV); đang có trưởng thì cần lý do. */
function SetLeadDialog({ vm }: { vm: SetLeadViewModel }) {
  const formId = useId()
  const target = vm.target
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && vm.close()}>
      <DialogContent
        title={`${vm.hasLead ? 'Đổi' : 'Chọn'} trưởng tiểu ban ${target?.name ?? ''}`}
        description={
          vm.hasLead
            ? `${target?.lead?.fullName ?? ''} thôi chức trưởng, vẫn ở lại tiểu ban. Cộng tác viên không làm trưởng được.`
            : 'Chọn trong nhân sự hiện có của tiểu ban. Cộng tác viên không làm trưởng được.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={vm.close} disabled={vm.saving}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.saving}>
              Lưu trưởng tiểu ban
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            vm.submit()
          }}
          className="space-y-4"
        >
          <FormField label="Trưởng tiểu ban mới" required error={vm.userIdError ?? undefined}>
            <NativeSelect value={vm.userId} onChange={(event) => vm.setUserId(event.target.value)}>
              <option value="">Chọn nhân sự</option>
              {vm.choices.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                  {member.homeClubName ? ` · ${member.homeClubName}` : member.departmentName ? ` · Ban ${member.departmentName}` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {vm.choices.length === 0 && <p className="text-sm text-muted-foreground">Tiểu ban chưa có nhân sự nào làm trưởng được. Hãy mời thêm người trước.</p>}
          {vm.hasLead && (
            <FormField label="Lý do" required error={vm.reasonError ?? undefined} hint="Người thôi chức nhận thông báo kèm lý do này.">
              <Textarea rows={3} maxLength={REASON_MAX} value={vm.reason} onChange={(event) => vm.setReason(event.target.value)} />
            </FormField>
          )}
          <FormAlert message={vm.formError} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EventStaffTab({ event, clubId, canManage }: { event: EventDetail; clubId: string; canManage: boolean }) {
  const staff = useEventStaffViewModel(clubId, event.id, true)
  const collaborator = useAddCollaboratorViewModel(clubId, event.id)
  const coHosts = useCoHostsViewModel(clubId, event.id, true)
  const setLead = useSetLeadViewModel(clubId, event.id)

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

      <StaffSignupAdmin event={event} canManage={canManage} />
      <CoHostSection vm={coHosts} canManage={canManage} eventName={event.name} />

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
            <SubcommitteeCard
              key={subcommittee.id}
              subcommittee={subcommittee}
              onInvite={() => staff.openInvite(subcommittee)}
              onAddCollaborator={() => collaborator.open(subcommittee)}
              onSetLead={() => setLead.open(subcommittee)}
            />
          ))}
        </motion.ul>
      )}

      {canManage && <CreateSubcommitteeDialog staff={staff} />}
      <InviteDialog staff={staff} coHosts={coHosts.accepted} />
      <AddCollaboratorDialog vm={collaborator} />
      <SetLeadDialog vm={setLead} />
    </div>
  )
}
