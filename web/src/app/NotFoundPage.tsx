import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { homeOf } from '@/features/account/viewModel/redirect'
import { useSession } from '@/features/account/viewModel/useSession'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/StateViews'

export function NotFoundPage() {
  const accountType = useSession().data?.accountType ?? 'USER'
  return (
    <EmptyState
      icon={Compass}
      title="Không tìm thấy trang"
      description="Đường dẫn có thể đã sai hoặc trang không còn tồn tại."
      action={
        <Button asChild variant="outline">
          <Link to={homeOf(accountType)}>{accountType === 'ADMIN' ? 'Về trang quản trị' : 'Về danh sách CLB'}</Link>
        </Button>
      }
      className="mt-10"
    />
  )
}
