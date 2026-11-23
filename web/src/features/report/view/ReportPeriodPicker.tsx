import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/Button'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import type { ReportPeriodKind } from '../model/reportPeriodTypes'
import { REPORT_PERIOD_KINDS, reportPeriodKindLabel } from '../viewModel/reportPeriodDisplay'
import type { ReportPeriodParams } from '../viewModel/useReportPeriodParams'

/** Ô chọn kỳ dùng chung cho các báo cáo (FR-FIN-12, FR-RPT-02..04). */
export function ReportPeriodPicker({ params, loading, children }: { params: ReportPeriodParams; loading: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-start">
      {children}
      <FormField label="Loại kỳ" className="sm:w-44">
        <NativeSelect value={params.period} onChange={(event) => params.setPeriod(event.target.value as ReportPeriodKind)}>
          {REPORT_PERIOD_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {reportPeriodKindLabel[kind]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {params.period !== 'CUSTOM' ? (
        <FormField label="Kỳ" className="sm:w-64">
          <NativeSelect value={params.key ?? ''} onChange={(event) => params.setKey(event.target.value)} disabled={params.options.length === 0}>
            {params.options.length === 0 && <option value="">{loading ? 'Đang tải…' : 'Chưa có kỳ nào'}</option>}
            {params.options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : (
        <>
          <FormField label="Từ ngày" className="sm:w-40" error={params.customError?.field === 'from' ? params.customError.message : undefined}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" value={params.customFrom} onChange={(event) => params.setCustomFrom(event.target.value)} />
          </FormField>
          <FormField label="Đến ngày" className="sm:w-40" error={params.customError?.field === 'to' ? params.customError.message : undefined}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" value={params.customTo} onChange={(event) => params.setCustomTo(event.target.value)} />
          </FormField>
          <Button onClick={params.applyCustom} className="sm:mt-7">
            Xem
          </Button>
        </>
      )}
    </div>
  )
}
