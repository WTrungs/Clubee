import { Download } from 'lucide-react'
import { EXPORT_FORMATS, type ExportFormat } from '@/shared/lib/exportFormat'
import { Button } from './Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu'

/** FR-RPT-07: nút Xuất báo cáo, chọn Excel hoặc PDF; tệp do máy chủ sinh theo kỳ, bộ lọc đang chọn. */
export function ExportMenu({ onExport, pending, label = 'Xuất' }: { onExport: (format: ExportFormat) => void; pending: boolean; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" loading={pending}>
          <Download aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {EXPORT_FORMATS.map((format) => (
          <DropdownMenuItem key={format.value} onSelect={() => onExport(format.value)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
