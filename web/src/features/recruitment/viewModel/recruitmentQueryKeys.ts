export const recruitmentQueryKeys = {
  all: ['recruitments'] as const,
  list: (clubId: string, page: number) => ['recruitments', 'list', clubId, page] as const,
  detail: (clubId: string, recruitmentId: string) => ['recruitments', 'detail', clubId, recruitmentId] as const,
  judges: (clubId: string) => ['recruitments', 'judges', clubId] as const,
}
