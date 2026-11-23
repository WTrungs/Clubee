import { httpClient } from '@/api/httpClient'
import type { Calendar, CalendarQuery } from './calendarTypes'

export const calendarRepository = {
  mine: (query: CalendarQuery) => httpClient.get<Calendar>('/me/calendar', { query: { from: query.from, to: query.to, clubId: query.clubId } }),
}
