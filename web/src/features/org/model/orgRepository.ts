import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  CloseDepartmentRequest,
  CreatePositionRequest,
  Department,
  DepartmentRequest,
  DepartmentStatus,
  Position,
  PositionCandidate,
  PositionQuery,
  RevokePositionRequest,
  StandingRole,
  UpdateDepartmentRequest,
} from './orgTypes'
import type { PermissionMatrix, PermissionMatrixChangeLog, UpdatePermissionMatrixRequest } from './permissionTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const department = (clubId: string, departmentId: string) => `${club(clubId)}/departments/${encodeURIComponent(departmentId)}`

export const orgRepository = {
  /** FR-ORG-01: ban đã đóng vẫn tra cứu được qua `status=CLOSED`. */
  departments: (clubId: string, status: DepartmentStatus) => httpClient.get<Department[]>(`${club(clubId)}/departments`, { query: { status } }),
  createDepartment: (clubId: string, request: DepartmentRequest) => httpClient.post<Department>(`${club(clubId)}/departments`, request),
  updateDepartment: (clubId: string, departmentId: string, request: UpdateDepartmentRequest) =>
    httpClient.patch<Department>(department(clubId, departmentId), request),
  closeDepartment: (clubId: string, departmentId: string, request: CloseDepartmentRequest) =>
    httpClient.post<Department>(`${department(clubId, departmentId)}/transitions`, request),
  /** FR-ORG-06: ai đang giữ chức gì, hoặc chức vụ của một nhiệm kỳ đã đóng; mặc định 50 dòng một trang. */
  positions: (clubId: string, query: PositionQuery) =>
    httpClient.get<Page<Position>>(`${club(clubId)}/positions`, {
      query: { termId: query.termId, scopeType: query.scopeType, scopeId: query.scopeId, userId: query.userId, q: query.q, page: query.page, size: query.size },
    }),
  /** FR-ORG-02: người đủ điều kiện giữ chức vụ ở phạm vi đã chọn (BR-ORG-01). */
  candidates: (clubId: string, role: StandingRole, scopeId: string) =>
    httpClient.get<PositionCandidate[]>(`${club(clubId)}/position-candidates`, { query: { role, scopeId } }),
  assign: (clubId: string, request: CreatePositionRequest) => httpClient.post<Position>(`${club(clubId)}/positions`, request),
  /** FR-ORG-03. */
  revoke: (clubId: string, positionId: string, request: RevokePositionRequest) =>
    httpClient.post<Position>(`${club(clubId)}/positions/${encodeURIComponent(positionId)}/revocation`, request),
  /** FR-ORG-05: bảng phân quyền, sửa theo lô, khôi phục mặc định, lịch sử. */
  permissionMatrix: (clubId: string) => httpClient.get<PermissionMatrix>(`${club(clubId)}/permission-matrix`),
  updatePermissionMatrix: (clubId: string, request: UpdatePermissionMatrixRequest) => httpClient.put<PermissionMatrix>(`${club(clubId)}/permission-matrix`, request),
  resetPermissionMatrix: (clubId: string, version: number) => httpClient.post<PermissionMatrix>(`${club(clubId)}/permission-matrix/reset`, { version }),
  permissionChanges: (clubId: string, query: { page?: number; size?: number }) =>
    httpClient.get<Page<PermissionMatrixChangeLog>>(`${club(clubId)}/permission-matrix/changes`, { query }),
}
