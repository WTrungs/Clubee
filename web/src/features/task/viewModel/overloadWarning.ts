import type { AssignableMember } from '../model/taskTypes'

/** FR-TASK-09: giao thêm một việc mà người nhận vượt ngưỡng việc đang làm thì cảnh báo; chỉ cảnh báo, vẫn giao được. */
export function overloadWarning(member: Pick<AssignableMember, 'fullName' | 'openTaskCount'> | null | undefined, threshold: number | null | undefined): string | null {
  if (!member || threshold === null || threshold === undefined) return null
  if (member.openTaskCount + 1 <= threshold) return null
  return `${member.fullName} đang làm ${member.openTaskCount} việc; giao thêm sẽ vượt ngưỡng ${threshold} việc của CLB. Bạn vẫn giao được.`
}
