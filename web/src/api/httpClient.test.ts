import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from './mocks/server'
import { ApiError, getErrorMessage } from './apiError'
import { buildUrl, httpClient } from './httpClient'

describe('buildUrl', () => {
  it('skips empty values and repeats array params', () => {
    const url = new URL(buildUrl('/clubs/c1/tasks', { status: ['ASSIGNED', 'IN_PROGRESS'], q: '', page: 0, size: undefined }))
    expect(url.pathname).toBe('/api/v1/clubs/c1/tasks')
    expect(url.searchParams.getAll('status')).toEqual(['ASSIGNED', 'IN_PROGRESS'])
    expect(url.searchParams.has('q')).toBe(false)
    expect(url.searchParams.get('page')).toBe('0')
  })
})

describe('httpClient', () => {
  it('sends JSON with the session cookie and echoes the CSRF cookie on writes', async () => {
    document.cookie = 'XSRF-TOKEN=token-123; path=/'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    let seen: { csrf: string | null; body: unknown } | undefined
    server.use(
      http.post('*/api/v1/echo', async ({ request }) => {
        seen = { csrf: request.headers.get('X-XSRF-TOKEN'), body: await request.json() }
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(httpClient.post('/echo', { name: 'A' })).resolves.toEqual({ ok: true })
    expect(seen).toEqual({ csrf: 'token-123', body: { name: 'A' } })
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('include')
    fetchSpy.mockRestore()
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
  })

  it('does not send the CSRF header on reads', async () => {
    document.cookie = 'XSRF-TOKEN=token-123; path=/'
    let csrf: string | null = 'unset'
    server.use(
      http.get('*/api/v1/read', ({ request }) => {
        csrf = request.headers.get('X-XSRF-TOKEN')
        return HttpResponse.json([])
      }),
    )
    await httpClient.get('/read')
    expect(csrf).toBeNull()
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
  })

  it('maps Problem Details to ApiError with the server reason', async () => {
    server.use(
      http.post('*/api/v1/forbidden', () =>
        HttpResponse.json(
          { status: 403, detail: 'Chỉ ban chủ nhiệm được duyệt sự kiện.', code: 'FORBIDDEN' },
          { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const error = await httpClient.post('/forbidden').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).code).toBe('FORBIDDEN')
    expect(getErrorMessage(error)).toBe('Chỉ ban chủ nhiệm được duyệt sự kiện.')
  })

  it('falls back to a Vietnamese message when the server sends no detail', async () => {
    server.use(http.get('*/api/v1/conflict', () => new HttpResponse(null, { status: 409 })))
    const error = await httpClient.get('/conflict').catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(409)
    expect(getErrorMessage(error)).toContain('người khác thay đổi')
  })

  it('reports network failures as status 0', async () => {
    server.use(http.get('*/api/v1/down', () => HttpResponse.error()))
    const error = await httpClient.get('/down').catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(0)
    expect(getErrorMessage(error)).toContain('Không kết nối được máy chủ')
  })

  it('returns undefined for 204', async () => {
    server.use(http.post('*/api/v1/empty', () => new HttpResponse(null, { status: 204 })))
    await expect(httpClient.post('/empty')).resolves.toBeUndefined()
  })
})
