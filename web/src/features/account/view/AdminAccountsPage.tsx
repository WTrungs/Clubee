import { motion } from 'motion/react'
import { KeyRound, Lock, LockOpen, SearchX, UserSearch } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { AdminAccount } from '../model/adminTypes'
import { ADMIN_EMAIL_QUERY_MIN, accountStatusDisplay, clubCountText, lastLoginText, lockLine } from '../viewModel/adminDisplay'
import { useAdminAccountsViewModel, type AdminAccountsViewModel } from '../viewModel/useAdminAccountsViewModel'

function AccountActions({ account, vm }: { account: AdminAccount; vm: AdminAccountsViewModel }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {account.allowedActions.includes('SEND_PASSWORD_RESET') && (
        <Button size="sm" variant="outline" disabled={vm.pending} onClick={() => vm.openDialog(account, 'SEND_PASSWORD_RESET')}>
          <KeyRound aria-hidden />
          Gửi liên kết đặt mật khẩu
        </Button>
      )}
      {account.allowedActions.includes('LOCK') && (
        <Button size="sm" variant="outline" className="text-destructive" disabled={vm.pending} onClick={() => vm.openDialog(account, 'LOCK')}>
          <Lock aria-hidden />
          Khóa
        </Button>
      )}
      {account.allowedActions.includes('UNLOCK') && (
        <Button size="sm" disabled={vm.pending} onClick={() => vm.openDialog(account, 'UNLOCK')}>
          <LockOpen aria-hidden />
          Mở khóa
        </Button>
      )}
    </div>
  )
}

function AccountSummary({ account }: { account: AdminAccount }) {
  const display = accountStatusDisplay[account.status]
  const lock = lockLine(account)
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{account.fullName}</p>
        <Badge tone={display.tone}>{display.label}</Badge>
        {account.accountType === 'ADMIN' && <Badge tone="info">Quản trị</Badge>}
      </div>
      <p className="text-sm break-all">{account.email}</p>
      <p className="text-xs text-muted-foreground">
        Tạo ngày {formatDate(account.createdAt)} · {lastLoginText(account.lastLoginAt)} · {clubCountText(account.clubCount)}
      </p>
      {lock && <p className="text-xs text-status-danger">{lock}</p>}
    </div>
  )
}

/** FR-ACC-09: tìm tài khoản theo email; Admin không xem được SĐT hay dữ liệu CLB (SRS 3.4). */
export function AdminAccountsPage() {
  const vm = useAdminAccountsViewModel()
  const wide = useMediaQuery('(min-width: 768px)')
  // Chữ của hộp thoại lấy theo lần mở gần nhất để không đổi giữa lúc đang đóng.
  const shown = vm.shownDialog
  const transitionMode = shown && shown.mode !== 'SEND_PASSWORD_RESET' ? shown.mode : 'LOCK'

  return (
    <div>
      <PageHeader eyebrow="Quản trị hệ thống" title="Tài khoản" description="Tìm theo email để khóa, mở khóa hoặc gửi lại liên kết đặt mật khẩu. Mọi thao tác đều được ghi nhật ký." />
      <SearchInput
        label="Tìm theo email"
        placeholder="Nhập ít nhất 3 ký tự của email…"
        value={vm.email}
        onValueChange={vm.setEmail}
        className="mb-2 sm:max-w-md"
      />
      <p className="mb-5 text-xs text-muted-foreground">Không liệt kê toàn bộ người dùng; nhập ít nhất {ADMIN_EMAIL_QUERY_MIN} ký tự để tìm.</p>
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} message="Tài khoản vừa được thay đổi ở nơi khác. Tải lại để xem trạng thái mới nhất." />

      {vm.needsMoreInput && <EmptyState icon={UserSearch} title="Nhập email để tìm tài khoản" description="Ví dụ: một phần tên trước @ hoặc tên miền." />}
      {vm.loading && (
        <div className="space-y-3" role="status" aria-label="Đang tìm tài khoản">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {vm.searched && !vm.error && vm.accounts.length === 0 && <EmptyState icon={SearchX} title="Không có tài khoản phù hợp" description="Thử một phần email khác." />}
      {vm.accounts.length > 0 && (
        <motion.ul
          key={vm.page}
          variants={listVariants}
          initial="initial"
          animate="animate"
          aria-label="Kết quả tìm tài khoản"
          aria-busy={vm.refreshing || undefined}
          className={cn('space-y-3 transition-opacity duration-200', vm.refreshing && 'pointer-events-none opacity-60')}
        >
          {vm.accounts.map((account) => (
            <motion.li
              key={account.id}
              variants={itemVariants}
              className={wide ? 'flex items-start justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm' : 'space-y-3 rounded-2xl border bg-card p-4 shadow-sm'}
            >
              <AccountSummary account={account} />
              <AccountActions account={account} vm={vm} />
            </motion.li>
          ))}
        </motion.ul>
      )}
      {!vm.error && (
        <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} className="mt-5" />
      )}

      <ReasonDialog
        open={vm.dialog !== null && vm.dialog.mode !== 'SEND_PASSWORD_RESET'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title={transitionMode === 'LOCK' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        description={
          transitionMode === 'LOCK'
            ? `${shown?.account.email ?? ''} bị đăng xuất ngay và không đăng nhập được tới khi mở khóa. Lý do được ghi nhật ký.`
            : `${shown?.account.email ?? ''} đăng nhập lại được ngay. Lý do được ghi nhật ký.`
        }
        confirmLabel={transitionMode === 'LOCK' ? 'Khóa' : 'Mở khóa'}
        confirmVariant={transitionMode === 'LOCK' ? 'destructive' : 'primary'}
        pending={vm.pending}
        onConfirm={vm.confirmTransition}
      />
      <ConfirmDialog
        open={vm.dialog?.mode === 'SEND_PASSWORD_RESET'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Gửi liên kết đặt mật khẩu"
        description={`Hệ thống gửi thư có liên kết đặt lại mật khẩu tới ${shown?.account.email ?? ''}. Mật khẩu hiện tại vẫn dùng được tới khi người dùng đặt mật khẩu mới.`}
        confirmLabel="Gửi"
        pending={vm.pending}
        onConfirm={vm.confirmReset}
      />
    </div>
  )
}
