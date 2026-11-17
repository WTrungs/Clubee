import { describe, expect, it } from 'vitest'
import spec from '../../../docs/openapi.yaml?raw'
import { routeHandlers } from './handlers'

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

/** Đọc `paths` của spec theo thụt lề cố định: đường dẫn 2 dấu cách, method 4 dấu cách. */
function readSpecPaths(yaml: string): { paths: string[]; operations: string[] } {
  const paths: string[] = []
  const operations: string[] = []
  let inPaths = false
  let currentPath: string | null = null
  for (const line of yaml.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPaths = line.startsWith('paths:')
      currentPath = null
      continue
    }
    if (!inPaths) continue
    const path = /^ {2}(\/\S*):\s*$/.exec(line)
    if (path) {
      currentPath = path[1] ?? null
      if (currentPath) paths.push(currentPath)
      continue
    }
    const method = /^ {4}([a-z]+):\s*$/.exec(line)
    if (method && currentPath && METHODS.includes(method[1] ?? '')) operations.push(`${method[1]?.toUpperCase()} ${currentPath}`)
  }
  return { paths, operations: operations.sort() }
}

/** Đổi route MSW sang dạng spec: bỏ tiền tố gốc API, `:clubId` thành `{clubId}`. */
function mockOperation(method: string, path: string): string {
  const specPath = path.replace(/^\*\/api\/v1/, '').replace(/:([A-Za-z]+)/g, '{$1}')
  return `${method.toUpperCase()} ${specPath}`
}

function mockOperations(): string[] {
  return routeHandlers
    .map((handler) => {
      const { method, path } = handler.info
      if (typeof method !== 'string' || typeof path !== 'string') throw new Error('Route mock phải là chuỗi để đối chiếu với spec.')
      return mockOperation(method, path)
    })
    .sort()
}

describe('docs/openapi.yaml khớp với mock MSW', () => {
  it('đọc được paths theo thụt lề của spec', () => {
    const yaml = [
      'openapi: 3.1.0',
      'paths:',
      '  /me:',
      '    get:',
      '      summary: x',
      '    parameters: []',
      '  /clubs/{clubId}:',
      '    patch:',
      'components:',
      '  /fake:',
      '    get:',
    ].join('\n')
    expect(readSpecPaths(yaml)).toEqual({ paths: ['/me', '/clubs/{clubId}'], operations: ['GET /me', 'PATCH /clubs/{clubId}'] })
  })

  it('đổi route MSW sang dạng spec', () => {
    expect(mockOperation('POST', '*/api/v1/clubs/:clubId/events/:eventId/transitions')).toBe('POST /clubs/{clubId}/events/{eventId}/transitions')
  })

  it('mọi route mock có trong spec và spec không có route thừa', () => {
    const fromMocks = mockOperations()
    const { paths, operations: fromSpec } = readSpecPaths(spec)
    expect(new Set(fromMocks).size, 'Mock có route trùng').toBe(fromMocks.length)
    expect(paths.filter((path, index) => paths.indexOf(path) !== index), 'docs/openapi.yaml có đường dẫn khai hai lần').toEqual([])
    expect(fromMocks.filter((operation) => !fromSpec.includes(operation)), 'Route mock chưa có trong docs/openapi.yaml').toEqual([])
    expect(fromSpec.filter((operation) => !fromMocks.includes(operation)), 'docs/openapi.yaml có route mock không xử lý').toEqual([])
  })
})
