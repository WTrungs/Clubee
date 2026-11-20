import { describe, expect, it } from 'vitest'
import { clubProfileSchema, createClubSchema, toUpdateClubRequest, type ClubProfileValues } from './clubSchemas'

const paths = (result: { error?: { issues: Array<{ path: PropertyKey[] }> } }) => result.error?.issues.map((issue) => issue.path.join('.')).sort() ?? []
const profile: ClubProfileValues = {
  name: 'CLB Nhiếp ảnh',
  shortName: 'NA',
  field: 'Nghệ thuật',
  description: 'Chụp ảnh, triển lãm và dạy nhiếp ảnh cơ bản.',
  contactEmail: '',
  contactPhone: '',
  contactUrl: '',
  rules: '',
  collectsStudentId: false,
}

describe('create club form (FR-CLB-01)', () => {
  it('needs a name, short name, field and description', () => {
    expect(createClubSchema.safeParse({ name: 'CLB Nhiếp ảnh', shortName: 'NA', field: 'Nghệ thuật', description: 'Chụp ảnh và triển lãm.' }).success).toBe(true)
    expect(paths(createClubSchema.safeParse({ name: 'AB', shortName: 'A', field: '', description: 'ngắn' }))).toEqual(['description', 'field', 'name', 'shortName'])
    expect(paths(createClubSchema.safeParse({ name: 'CLB Nhiếp ảnh', shortName: 'QUA-DAI-QUA', field: 'Nghệ thuật', description: 'Chụp ảnh và triển lãm.' }))).toEqual(['shortName'])
  })
})

describe('club profile form (FR-CLB-02)', () => {
  it('allows empty contacts and checks them when filled', () => {
    expect(clubProfileSchema.safeParse(profile).success).toBe(true)
    const wrong = clubProfileSchema.safeParse({ ...profile, contactEmail: 'không phải email', contactPhone: '123', contactUrl: 'javascript:alert(1)' })
    expect(paths(wrong)).toEqual(['contactEmail', 'contactPhone', 'contactUrl'])
  })

  it('sends null for empty contacts and normalizes the phone', () => {
    expect(toUpdateClubRequest({ ...profile, contactPhone: '028 3725 2002', rules: '  Điều 1  ' }, 4)).toMatchObject({
      contactEmail: null,
      contactPhone: '02837252002',
      contactUrl: null,
      rules: 'Điều 1',
      version: 4,
    })
  })
})
