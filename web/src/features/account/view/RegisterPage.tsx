import { motion } from 'motion/react'
import { MailCheck } from 'lucide-react'
import { Link } from 'react-router'
import { spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { useRegisterViewModel } from '../viewModel/useRegisterViewModel'
import { PasswordInput } from './PasswordInput'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

export function RegisterPage() {
  const vm = useRegisterViewModel()
  const { register, formState } = vm.form

  if (vm.registeredEmail) {
    return (
      <div className="space-y-6 text-center">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
          className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-status-success-soft text-status-success"
        >
          <MailCheck aria-hidden className="size-8" />
        </motion.span>
        <div className="space-y-2" role="status">
          <h1 className="text-2xl font-extrabold tracking-tight">Kiểm tra hộp thư của bạn</h1>
          <p className="text-muted-foreground">
            Chúng tôi đã gửi liên kết xác thực tới <span className="font-semibold text-foreground">{vm.registeredEmail}</span>. Tài khoản sẽ hoạt
            động sau khi bạn mở liên kết đó.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link to="/login">Về trang đăng nhập</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight">Tạo tài khoản</h1>
        <p className="text-muted-foreground">Một tài khoản dùng cho mọi CLB bạn tham gia.</p>
      </div>

      <form noValidate onSubmit={vm.submit} className="space-y-4">
        <FormField label="Họ và tên" required error={formState.errors.fullName?.message}>
          <Input autoComplete="name" placeholder="Nguyễn Văn A" {...register('fullName')} />
        </FormField>
        <FormField label="Email" required error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="ban@vidu.com" {...register('email')} />
        </FormField>
        <FormField label="Mật khẩu" required error={formState.errors.password?.message} hint="Ít nhất 8 ký tự; nên có chữ hoa, số và ký hiệu.">
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>
        <PasswordStrengthMeter strength={vm.strength} />
        <FormField label="Nhập lại mật khẩu" required error={formState.errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
        <Button type="submit" size="lg" className="w-full" loading={vm.pending}>
          Đăng ký
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  )
}
