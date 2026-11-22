import { accountHandlers } from './accountHandlers'
import { advanceHandlers } from './advanceHandlers'
import { duesHandlers } from './duesHandlers'
import { financeReportHandlers } from './financeReportHandlers'
import { adminGuardHandlers, adminHandlers } from './adminHandlers'
import { announcementHandlers } from './announcementHandlers'
import { attendanceHandlers } from './attendanceHandlers'
import { backlogHandlers } from './backlogHandlers'
import { calendarHandlers } from './calendarHandlers'
import { clubHandlers } from './clubHandlers'
import { coHostHandlers } from './coHostHandlers'
import { documentHandlers } from './documentHandlers'
import { eventHandlers } from './eventHandlers'
import { financeHandlers } from './financeHandlers'
import { invitationHandlers } from './invitationHandlers'
import { leaveHandlers } from './leaveHandlers'
import { memberHandlers } from './memberHandlers'
import { meReportHandlers } from './meReportHandlers'
import { notificationHandlers } from './notificationHandlers'
import { orgHandlers } from './orgHandlers'
import { permissionHandlers } from './permissionHandlers'
import { recruitmentHandlers } from './recruitmentHandlers'
import { sessionHandlers } from './sessionHandlers'
import { taskHandlers } from './taskHandlers'
import { termHandlers } from './termHandlers'
import { transferHandlers } from './transferHandlers'

/** Route API thật, đối chiếu với docs/openapi.yaml. */
export const routeHandlers = [...accountHandlers, ...adminHandlers, ...clubHandlers, ...memberHandlers, ...invitationHandlers, ...leaveHandlers, ...backlogHandlers, ...orgHandlers, ...permissionHandlers, ...termHandlers, ...transferHandlers, ...taskHandlers, ...eventHandlers, ...coHostHandlers, ...sessionHandlers, ...attendanceHandlers, ...calendarHandlers, ...meReportHandlers, ...documentHandlers, ...recruitmentHandlers, ...financeHandlers, ...advanceHandlers, ...duesHandlers, ...financeReportHandlers, ...notificationHandlers, ...announcementHandlers]

/** Bộ chặn Admin ở route CLB chạy trước mọi route (NFR-SEC-06). */
export const handlers = [...adminGuardHandlers, ...routeHandlers]
