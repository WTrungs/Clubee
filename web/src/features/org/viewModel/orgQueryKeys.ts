import type { DepartmentStatus, PositionQuery, StandingRole } from '../model/orgTypes'

export const orgQueryKeys = {
  all: ['org'] as const,
  departments: (clubId: string, status: DepartmentStatus) => ['org', 'departments', clubId, status] as const,
  positions: (clubId: string, query: PositionQuery) => ['org', 'positions', clubId, query] as const,
  candidates: (clubId: string, role: StandingRole, scopeId: string) => ['org', 'candidates', clubId, role, scopeId] as const,
  permissionMatrix: (clubId: string) => ['org', 'permissionMatrix', clubId] as const,
  permissionChanges: (clubId: string, page: number) => ['org', 'permissionChanges', clubId, page] as const,
}
