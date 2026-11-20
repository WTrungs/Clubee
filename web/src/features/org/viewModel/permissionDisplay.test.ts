import { describe, expect, it } from 'vitest'
import type { PermissionMatrixCell } from '../model/permissionTypes'
import { describeChange, groupPermissions, pendingChangeList, shownEnabled, switchLabel, togglePending } from './permissionDisplay'

const treasurerMembers: PermissionMatrixCell = { role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: true, defaultEnabled: true, state: 'EDITABLE', lockReason: null }

describe('permission display (FR-ORG-05)', () => {
  it('names switches and groups permissions in server order', () => {
    expect(switchLabel(treasurerMembers)).toBe('Quản lý thành viên cho Thủ quỹ')
    expect(groupPermissions(['CONFIGURE_CLUB', 'MANAGE_MEMBERS', 'APPROVE_EXPENSE']).map((group) => group.label)).toEqual(['Câu lạc bộ', 'Thành viên', 'Tài chính'])
    expect(describeChange({ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false })).toBe('Thủ quỹ: tắt Quản lý thành viên')
  })

  it('tracks unsaved changes and drops a cell toggled back to its saved value', () => {
    const off = togglePending({}, treasurerMembers, false)
    expect(off).toEqual({ 'TREASURER:MANAGE_MEMBERS': false })
    expect(togglePending(off, treasurerMembers, true)).toEqual({})
    const matrix = { roles: [], permissions: [], cells: [treasurerMembers], changedFromDefault: 0, updatedAt: null, updatedBy: null, allowedActions: [], version: 1 }
    expect(pendingChangeList(matrix, off)).toEqual([{ role: 'TREASURER', permission: 'MANAGE_MEMBERS', enabled: false }])
    expect(pendingChangeList(null, off)).toEqual([])
  })

  it('shows the unsaved value when there is one, otherwise the saved value', () => {
    expect(shownEnabled(treasurerMembers, {})).toBe(true)
    expect(shownEnabled(treasurerMembers, { 'TREASURER:MANAGE_MEMBERS': false })).toBe(false)
    expect(shownEnabled(treasurerMembers, { 'PRESIDENT:MANAGE_MEMBERS': false })).toBe(true)
  })
})
