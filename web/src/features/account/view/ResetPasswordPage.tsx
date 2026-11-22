import { motion } from 'motion/react'
import { ArrowLeft, KeyRound, Link2Off, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { PASSWORD_RESET_MINUTES } from '@/shared/lib/accountRules'
import { spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { useResetPasswordViewModel, type ResetPageState } from '../viewModel/useResetPasswordViewModel'
import { PasswordInput } from './PasswordInput'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

const deadEnds: Partial<Record<ResetPageState, { title: string; text: string }>> = {
  missing: { title: 'Thiếu liên kết đặt lại', text: 'Mở đúng liên kết trong email đặt lại mật khẩu, hoặc gửi yêu cầu mới.' },
  notFound: { title: 'Liên kết không đúng', text: 'Liên kết có thể bị cắt mất một phần khi sao chép. Mở lại liên kết trong email hoặc gửi yêu cầu mới.' },
  expired: { title: 'Liên kết đã hết hạn', text: `Liên kết chỉ dùng được trong ${PASSWORD_RESET_MINUTES} phút. Gửi yêu cầu mới để nhận liên kết khác.` },
  used: { title: 'Liên kết đã được dùng', text: 'Mỗi liên kết chỉ dùng được một lần, và liên kết cũ mất hiệu lực khi có liên kết mới hơn.' },
}

function StatusIcon({ children, tone }: { children: ReactNode; tone: 'success' | 'danger' }) {
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
      className={tone === 'success' ? 'inline-flex size-14 items-center justify-center rounded-2xl bg-status-success-soft text-status-success' : 'inline-flex size-14 items-center justify-center rounded-2xl bg-status-danger-soft text-status-danger'}
    >
      {children}
    </motion.span>
  )
}

/** FR-ACC-03: đặt mật khẩu mới từ liên kết trong email; liên kết dùng một lần, hết hạn sau 30 phút. */
export function ResetPasswordPage() {
  const vm = useResetPasswordViewModel()
  const { register, formState } = vm.form
  const deadEnd = deadEnds[vm.state]

  return (
    <div className="space-y-6">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Về đăng nhập
      </Link>

      {vm.state === 'checking' && (
        <div role="status" aria-label="Đang kiểm tra liên kết" className="space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {vm.state === 'error' && <ErrorState error={vm.linkError} onRetry={vm.retry} />}

      {deadEnd && (
        <div className="space-y-5" role="status">
          <StatusIcon tone="danger">
            <Link2Off aria-hidden className="size-7" />
          </StatusIcon>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{deadEnd.title}</h1>
            <p className="text-muted-foreground">{deadEnd.text}</p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/forgot-password">Gửi lại liên kết</Link>
          </Button>
        </div>
      )}

      {vm.state === 'done' && (
        <div className="space-y-5" role="status">
          <StatusIcon tone="success">
            <ShieldCheck aria-hidden className="size-7" />
          </StatusIcon>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight">Đã đặt mật khẩu mới</h1>
            <p className="text-muted-foreground">Mọi phiên đăng nhập cũ của tài khoản này đã bị đăng xuất. Đăng nhập lại bằng mật khẩu mới.</p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/login">Đăng nhập</Link>
          </Button>
        </div>
      )}

      {vm.state === 'valid' && (
        <>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight">Đặt mật khẩu mới</h1>
            <p className="text-muted-foreground">
              Cho tài khoản <span className="font-semibold break-all text-foreground">{vm.emailHint}</span>.
              {vm.expiresAt && ` Liên kết dùng được đến ${formatDateTime(vm.expiresAt)}.`}
            </p>
          </div>
          <form noValidate onSubmit={vm.submit} className="space-y-4">
            <FormField label="Mật khẩu mới" required error={formState.errors.newPassword?.message} hint="Ít nhất 8 ký tự; nên có chữ hoa, số và ký hiệu.">
              <PasswordInput autoComplete="new-password" {...register('newPassword')} />
            </FormField>
            <PasswordStrengthMeter strength={vm.strength} />
            <FormField label="Nhập lại mật khẩu mới" required error={formState.errors.confirmPassword?.message}>
              <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
            </FormField>
            <FormAlert message={vm.errorMessage} />
            <Button type="submit" size="lg" className="w-full" loading={vm.pending}>
              <KeyRound aria-hidden />
              Đặt mật khẩu
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
