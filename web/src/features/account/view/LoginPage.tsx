import { motion } from 'motion/react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { Link } from 'react-router'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { useLoginViewModel } from '../viewModel/useLoginViewModel'
import { PasswordInput } from './PasswordInput'

export function LoginPage() {
  const vm = useLoginViewModel()
  const { register, formState } = vm.form

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight">Chào mừng trở lại</h1>
        <p className="text-muted-foreground">Đăng nhập để vào CLB của bạn.</p>
      </div>

      <form noValidate onSubmit={vm.submit} className="space-y-4">
        <FormField label="Email" required error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="ban@vidu.com" {...register('email')} />
        </FormField>
        <FormField
          label="Mật khẩu"
          required
          error={formState.errors.password?.message}
          labelAside={
            <Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
              Quên mật khẩu?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>
        <FormAlert message={vm.errorMessage} />
        <Button type="submit" size="lg" className="w-full" loading={vm.pending}>
          Đăng nhập
          {!vm.pending && <ArrowRight aria-hidden />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Đăng ký
        </Link>
      </p>

      {vm.demoAccounts.length > 0 && (
        <section aria-labelledby="demo-heading" className="rounded-2xl border border-dashed bg-card/70 p-4">
          <h2 id="demo-heading" className="flex items-center gap-2 text-sm font-bold">
            <FlaskConical aria-hidden className="size-4 text-primary" />
            Tài khoản demo (chế độ mock)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Chọn một vai trò, rồi nhập mật khẩu bất kỳ từ 8 ký tự.</p>
          <motion.ul variants={listVariants} initial="initial" animate="animate" className="mt-3 space-y-2">
            {vm.demoAccounts.map((account) => (
              <motion.li key={account.email} variants={itemVariants}>
                <button
                  type="button"
                  onClick={() => vm.pickDemoAccount(account.email)}
                  className="group flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                >
                  <Avatar name={account.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {account.fullName}
                      <span className="rounded-full bg-primary-soft px-2 py-px text-2xs font-bold text-on-primary-soft">{account.roleLabel}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{account.description}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}
    </div>
  )
}
