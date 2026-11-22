export const recruitmentQueryKeys = {
  all: ['recruitments'] as const,
  list: (clubId: string, page: number) => ['recruitments', 'list', clubId, page] as const,
  detail: (clubId: string, recruitmentId: string) => ['recruitments', 'detail', clubId, recruitmentId] as const,
  judges: (clubId: string) => ['recruitments', 'judges', clubId] as const,
  applications: (clubId: string, recruitmentId: string) => ['recruitments', 'applications', clubId, recruitmentId] as const,
  applicationPage: (clubId: string, recruitmentId: string, query: object) => ['recruitments', 'applications', clubId, recruitmentId, query] as const,
  application: (clubId: string, applicationId: string) => ['recruitments', 'application', clubId, applicationId] as const,
  open: (q: string, page: number) => ['recruitments', 'open', q, page] as const,
  public: (recruitmentId: string) => ['recruitments', 'public', recruitmentId] as const,
  mine: ['recruitments', 'mine'] as const,
}
