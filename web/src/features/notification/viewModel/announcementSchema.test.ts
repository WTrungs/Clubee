import { describe, expect, it } from 'vitest'
import type { AnnouncementAudience } from '../model/notificationTypes'
import { announcementSchema, audienceKey, toSendAnnouncementRequest, type AnnouncementValues } from './announcementSchema'

const paths = (result: { error?: { issues: Array<{ path: PropertyKey[] }> } }) => result.error?.issues.map((issue) => issue.path.join('.')).sort() ?? []
const media: AnnouncementAudience = { kind: 'DEPARTMENT', scopeId: 'd-media', label: 'Ban Truyền thông', recipientCount: 3 }
const values: AnnouncementValues = { audience: audienceKey(media), title: 'Họp ban tuần này', body: 'Tối thứ Năm 19:00.', sendEmail: true }

describe('announcement form (FR-NOT-01)', () => {
  it('needs a group, a 3–150 character title and a body up to 2000 characters', () => {
    expect(announcementSchema.safeParse(values).success).toBe(true)
    expect(paths(announcementSchema.safeParse({ ...values, audience: '', title: 'ab', body: '   ' }))).toEqual(['audience', 'body', 'title'])
    expect(paths(announcementSchema.safeParse({ ...values, title: 'x'.repeat(151), body: 'y'.repeat(2001) }))).toEqual(['body', 'title'])
  })

  it('sends the chosen group with trimmed text', () => {
    expect(toSendAnnouncementRequest({ ...values, title: '  Họp ban  ', body: ' Nội dung ' }, [media])).toEqual({
      audience: { kind: 'DEPARTMENT', scopeId: 'd-media' },
      title: 'Họp ban',
      body: 'Nội dung',
      sendEmail: true,
    })
  })

  it('returns nothing when the chosen group is no longer offered', () => {
    expect(toSendAnnouncementRequest(values, [])).toBeNull()
  })
})
