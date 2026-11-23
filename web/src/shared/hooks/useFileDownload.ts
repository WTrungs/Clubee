import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/apiError'
import { saveBlob } from '@/shared/lib/saveBlob'

interface Downloaded {
  blob: Blob
  fileName: string | null
}

/** Tải một tệp máy chủ sinh ra (xuất Excel, PDF) rồi mở hộp lưu của trình duyệt; lỗi thì báo bằng toast. */
export function useFileDownload(fallbackName: string) {
  const mutation = useMutation({
    mutationFn: (fetcher: () => Promise<Downloaded>) => fetcher(),
    meta: { silentError: true },
    onSuccess: ({ blob, fileName }) => {
      saveBlob(blob, fileName ?? fallbackName)
      toast.success('Đã tạo tệp, trình duyệt đang tải về.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return { download: (fetcher: () => Promise<Downloaded>) => mutation.mutate(fetcher), pending: mutation.isPending }
}
