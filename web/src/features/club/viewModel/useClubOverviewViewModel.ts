import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { eventRepository } from '@/features/event/model/eventRepository'
import type { EventQuery } from '@/features/event/model/eventTypes'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { taskRepository } from '@/features/task/model/taskRepository'
import type { TaskQuery } from '@/features/task/model/taskTypes'
import { taskQueryKeys } from '@/features/task/viewModel/taskQueryKeys'
import { useCurrentClub } from './clubContext'

const UPCOMING_EVENTS: EventQuery = { status: ['APPROVED', 'REGISTRATION_OPEN', 'ONGOING'], size: 3 }

/** Trang tổng quan CLB: số liệu và danh sách ngắn lấy qua repository công khai của module Công việc, Sự kiện (NFR-MNT-01). */
export function useClubOverviewViewModel() {
  const { clubId, club } = useCurrentClub()
  const openTasksQuery: TaskQuery = { status: ['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW'], clubId, size: 50, sort: 'dueAt,asc' }
  const tasks = useQuery({ queryKey: taskQueryKeys.mine(openTasksQuery), queryFn: () => taskRepository.listMine(openTasksQuery) })
  const events = useQuery({ queryKey: eventQueryKeys.list(clubId, UPCOMING_EVENTS), queryFn: () => eventRepository.list(clubId, UPCOMING_EVENTS) })

  const openTasks = tasks.data?.content ?? []
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const canEditClub = club.allowedActions.includes('EDIT_CLUB')
  const canChangeStatus = club.allowedActions.includes('CHANGE_CLUB_STATUS')
  return {
    club,
    /** FR-CLB-02, 03, 04: menu Quản lý CLB hiện khi máy chủ trả `EDIT_CLUB` hoặc `CHANGE_CLUB_STATUS`. */
    canManageClub: canEditClub || canChangeStatus,
    canEditClub,
    canChangeStatus,
    statusOpen,
    openStatus: () => setStatusOpen(true),
    closeStatus: () => setStatusOpen(false),
    profileOpen,
    openProfile: () => setProfileOpen(true),
    closeProfile: () => setProfileOpen(false),
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    /** FR-NOT-01: nút gửi thông báo chỉ hiện khi máy chủ trả `SEND_ANNOUNCEMENT`. */
    canSendAnnouncement: club.allowedActions.includes('SEND_ANNOUNCEMENT'),
    composeOpen,
    openCompose: () => setComposeOpen(true),
    closeCompose: () => setComposeOpen(false),
    stats: {
      openTasks: tasks.data?.totalElements ?? 0,
      overdueTasks: openTasks.filter((task) => task.overdue).length,
      upcomingEvents: events.data?.totalElements ?? 0,
      members: club.memberCount,
    },
    statsLoading: tasks.isPending || events.isPending,
    nearestTasks: openTasks.slice(0, 5),
    tasksLoading: tasks.isPending,
    tasksError: tasks.error,
    upcoming: events.data?.content ?? [],
    eventsLoading: events.isPending,
    eventsError: events.error,
    retryTasks: () => void tasks.refetch(),
    retryEvents: () => void events.refetch(),
  }
}
