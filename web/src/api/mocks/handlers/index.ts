import { accountHandlers } from './accountHandlers'
import { adminGuardHandlers, adminHandlers } from './adminHandlers'
import { announcementHandlers } from './announcementHandlers'
import { attendanceHandlers } from './attendanceHandlers'
import { backlogHandlers } from './backlogHandlers'
import { clubHandlers } from './clubHandlers'
import { coHostHandlers } from './coHostHandlers'
import { eventHandlers } from './eventHandlers'
import { financeHandlers } from './financeHandlers'
import { invitationHandlers } from './invitationHandlers'
import { leaveHandlers } from './leaveHandlers'
import { memberHandlers } from './memberHandlers'
import { notificationHandlers } from './notificationHandlers'
import { orgHandlers } from './orgHandlers'
import { permissionHandlers } from './permissionHandlers'
import { sessionHandlers } from './sessionHandlers'
import { taskHandlers } from './taskHandlers'
import { termHandlers } from './termHandlers'
import { transferHandlers } from './transferHandlers'

/** Route API thật, đối chiếu với docs/openapi.yaml. */
export const routeHandlers = [...accountHandlers, ...adminHandlers, ...clubHandlers, ...memberHandlers, ...invitationHandlers, ...leaveHandlers, ...backlogHandlers, ...orgHandlers, ...permissionHandlers, ...termHandlers, ...transferHandlers, ...taskHandlers, ...eventHandlers, ...coHostHandlers, ...sessionHandlers, ...attendanceHandlers, ...financeHandlers, ...notificationHandlers, ...announcementHandlers]

/** Bộ chặn Admin ở route CLB chạy trước mọi route (NFR-SEC-06). */
export const handlers = [...adminGuardHandlers, ...routeHandlers]
