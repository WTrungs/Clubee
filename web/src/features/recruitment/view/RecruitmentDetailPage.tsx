import { ArrowLeft, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import type { RecruitmentDetail } from '../model/recruitmentTypes'
import { recruitmentPeriod, recruitmentStatusDisplay } from '../viewModel/recruitmentDisplay'
import { useRecruitmentDetailViewModel } from '../viewModel/useRecruitmentViewModels'
import { ApplicationsPanel } from './ApplicationsPanel'
import { RecruitmentFormSheet } from './RecruitmentFormSheet'
import { ResultsPanel } from './ResultsPanel'
import { RoundReviewPanel } from './RoundReviewPanel'

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  )
}

function RecruitmentInfo({ recruitment }: { recruitment: RecruitmentDetail }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <InfoCard title="Thông tin">
        <p className="text-sm">
          <span className="font-semibold">Nhận đơn:</span> {recruitmentPeriod(recruitment)}
        </p>
        {recruitment.description && <p className="text-sm whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{recruitment.description}</p>}
        <p className="text-xs text-muted-foreground">
          Mở bởi {recruitment.createdBy.fullName} · {formatDateTime(recruitment.createdAt)}
        </p>
      </InfoCard>
      <InfoCard title={`Chỉ tiêu (${recruitment.quotaTotal})`}>
        <ul aria-label="Chỉ tiêu theo ban" className="divide-y">
          {recruitment.quotas.map((quota) => (
            <li key={quota.departmentId} className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <span>Ban {quota.departmentName}</span>
              <span className="font-semibold tabular-nums">{quota.quota}</span>
            </li>
          ))}
        </ul>
      </InfoCard>
      <InfoCard title="Các vòng">
        <ol aria-label="Các vòng" className="list-decimal space-y-1 pl-5 text-sm">
          {recruitment.rounds.map((round) => (
            <li key={round.id}>{round.name}</li>
          ))}
        </ol>
        {recruitment.structureLocked && <p className="text-xs text-muted-foreground">Đợt đã mở nên các vòng và câu hỏi không đổi được nữa.</p>}
      </InfoCard>
      <InfoCard title="Giám khảo">
        {recruitment.judges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa phân công giám khảo.</p>
        ) : (
          <ul aria-label="Giám khảo" className="flex flex-wrap gap-2">
            {recruitment.judges.map((judge) => (
              <li key={judge.id}>
                <Badge tone="neutral">{judge.fullName}</Badge>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>
      <div className="lg:col-span-2">
        <InfoCard title={`Câu hỏi trong đơn (${recruitment.questions.length})`}>
          {recruitment.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Đơn chỉ gồm nguyện vọng ban.</p>
          ) : (
            <ol aria-label="Câu hỏi trong đơn" className="list-decimal space-y-1.5 pl-5 text-sm">
              {recruitment.questions.map((question) => (
                <li key={question.id} className="[overflow-wrap:anywhere]">
                  {question.text}
                  {question.required && <span className="text-xs font-semibold text-destructive"> · bắt buộc</span>}
                </li>
              ))}
            </ol>
          )}
        </InfoCard>
      </div>
    </div>
  )
}

/** FR-REC-01: chi tiết đợt tuyển phía ban chủ nhiệm. */
export function RecruitmentDetailPage() {
  const vm = useRecruitmentDetailViewModel()
  const recruitment = vm.recruitment
  return (
    <div>
      <Link to={`/clubs/${encodeURIComponent(vm.clubId)}/recruitments`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Tuyển thành viên
      </Link>
      <PageHeader
        eyebrow={vm.clubName}
        title={recruitment?.name ?? 'Đợt tuyển'}
        actions={
          recruitment && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={recruitmentStatusDisplay[recruitment.status].tone} dot>
                {recruitmentStatusDisplay[recruitment.status].label}
              </Badge>
              {vm.canEdit && (
                <Button variant="outline" onClick={vm.openEdit}>
                  <Pencil aria-hidden />
                  Sửa đợt tuyển
                </Button>
              )}
            </div>
          )
        }
      />
      {vm.loading && <Skeleton role="status" aria-label="Đang tải đợt tuyển" className="h-64 rounded-2xl" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {recruitment && (
        <Tabs value={vm.tab} onValueChange={vm.setTab}>
          <TabsBar aria-label="Đợt tuyển" active={vm.tab} items={vm.tabs} />
          <TabsContent value="info" className="pt-5">
            <RecruitmentInfo recruitment={recruitment} />
          </TabsContent>
          <TabsContent value="applications" className="pt-5">
            <ApplicationsPanel clubId={vm.clubId} recruitment={recruitment} active={vm.tab === 'applications'} />
          </TabsContent>
          <TabsContent value="rounds" className="pt-5">
            <RoundReviewPanel clubId={vm.clubId} recruitment={recruitment} active={vm.tab === 'rounds'} />
          </TabsContent>
          <TabsContent value="results" className="pt-5">
            <ResultsPanel clubId={vm.clubId} recruitment={recruitment} active={vm.tab === 'results'} />
          </TabsContent>
        </Tabs>
      )}
      {recruitment && vm.canEdit && <RecruitmentFormSheet open={vm.editOpen} editing={recruitment} onClose={vm.closeEdit} />}
    </div>
  )
}
