import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { nowIso } from '@/api/mocks/mockTime'
import { signInAs } from '@/testUtils'
import { documentRepository } from '../model/documentRepository'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const visibleTo = async (userId: string) => {
  signInAs(userId)
  return (await documentRepository.list('c-guitar', {})).content.map((document) => document.id).toSorted()
}

describe('who sees a document (FR-DOC-02)', () => {
  it('shows the board everything, a department its own files, and everyone the club-wide ones', async () => {
    expect(await visibleTo('u-anh')).toEqual(['doc-handover-2025', 'doc-media-plan', 'doc-rules', 'doc-winter-budget'])
    // Hà ở ban Truyền thông và trong BTC Đêm nhạc Mùa đông.
    expect(await visibleTo('u-ha')).toEqual(['doc-media-plan', 'doc-rules', 'doc-winter-budget'])
    // Thảo ở ban Chuyên môn, không trong BTC: chỉ tài liệu toàn CLB.
    expect(await visibleTo('u-thao')).toEqual(['doc-rules'])
    signInAs('u-thao')
    expect(await fail(documentRepository.get('c-guitar', 'doc-media-plan'))).toMatchObject({ status: 403 })
    signInAs('u-tu')
    expect(await fail(documentRepository.list('c-guitar', {}))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })

  it('checks again on every download, so someone who changed department loses the file', async () => {
    signInAs('u-ha')
    const file = await documentRepository.download('c-guitar', 'doc-media-plan')
    expect(file.fileName).toBe('ke-hoach-truyen-thong.docx')
    expect(file.blob.size).toBeGreaterThan(0)
    const ha = db.memberships.find((membership) => membership.userId === 'u-ha' && membership.clubId === 'c-guitar')
    if (ha) ha.departmentId = 'd-logistics'
    expect(await fail(documentRepository.download('c-guitar', 'doc-media-plan'))).toMatchObject({ status: 403 })
    expect((await documentRepository.list('c-guitar', {})).content.map((document) => document.id)).not.toContain('doc-media-plan')
  })

  it('keeps a document after its uploader left, with the name at upload time (BR-DATA-02)', async () => {
    signInAs('u-anh')
    const handover = await documentRepository.get('c-guitar', 'doc-handover-2025')
    expect(handover.uploadedBy).toMatchObject({ id: 'u-dat', fullName: 'Hồ Tấn Đạt' })
    expect(handover.term).toEqual({ id: 't-guitar-2025', name: 'Nhiệm kỳ 2025–2026' })
  })

  it('searches by name, file and tag, and filters by tag, term and owner', async () => {
    signInAs('u-anh')
    const ids = async (query: Parameters<typeof documentRepository.list>[1]) => (await documentRepository.list('c-guitar', query)).content.map((document) => document.id)
    expect(await ids({ q: 'du toan' })).toEqual(['doc-winter-budget'])
    expect(await ids({ tag: 'đêm nhạc' })).toEqual(['doc-media-plan', 'doc-winter-budget'])
    expect(await ids({ termId: 't-guitar-2025' })).toEqual(['doc-handover-2025'])
    expect(await ids({ ownerType: 'DEPARTMENT', ownerId: 'd-media' })).toEqual(['doc-media-plan'])
    const facets = await documentRepository.facets('c-guitar')
    expect(facets.tags).toContain('bàn giao')
    signInAs('u-thao')
    expect((await documentRepository.facets('c-guitar')).tags).toEqual(['nhiệm kỳ', 'nội quy'])
  })
})

describe('where I may upload (FR-DOC-01, permission matrix)', () => {
  it('follows MANAGE_DOCUMENTS and the scope of each position', async () => {
    signInAs('u-anh')
    const board = await documentRepository.scopes('c-guitar')
    expect(board[0]).toEqual({ type: 'CLUB', id: null, name: 'Toàn CLB' })
    expect(board.some((scope) => scope.type === 'EVENT' && scope.id === 'e-winter')).toBe(true)
    signInAs('u-linh')
    expect(await documentRepository.scopes('c-guitar')).toEqual([{ type: 'DEPARTMENT', id: 'd-media', name: 'Ban Truyền thông' }])
    signInAs('u-bao')
    expect(await documentRepository.scopes('c-guitar')).toEqual([{ type: 'EVENT', id: 'e-winter', name: 'Sự kiện Đêm nhạc Mùa đông' }])
    signInAs('u-thao')
    expect(await documentRepository.scopes('c-guitar')).toEqual([])

    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'DEPARTMENT_HEAD', permission: 'MANAGE_DOCUMENTS', enabled: false, updatedBy: 'u-anh', updatedAt: nowIso() })
    signInAs('u-linh')
    expect(await documentRepository.scopes('c-guitar')).toEqual([])
  })
})
