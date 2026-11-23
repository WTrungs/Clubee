import { readCookie } from '@/shared/lib/cookies'
import { ApiError, type ProblemDetail } from './apiError'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>
export type QueryParams = Record<string, QueryValue>

interface RequestOptions {
  query?: QueryParams
  /** Đối tượng được gửi dạng JSON; FormData được gửi nguyên dạng multipart. */
  body?: unknown
  signal?: AbortSignal
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'

export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item))
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function readProblem(response: Response): Promise<ProblemDetail> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('json')) return {}
  try {
    return (await response.json()) as ProblemDetail
  } catch {
    return {}
  }
}

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (method !== 'GET') {
    // Spring Security CookieCsrfTokenRepository: echo the XSRF-TOKEN cookie in a header.
    const csrfToken = readCookie('XSRF-TOKEN')
    if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0)
  }

  if (!response.ok) throw new ApiError(response.status, await readProblem(response))
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Tên tệp trong `Content-Disposition`: ưu tiên `filename*` (UTF-8, RFC 5987), không có thì `filename`. */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim())
    } catch {
      return null
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim() ?? null
}

/** Tải tệp: vẫn gửi cookie phiên, lỗi trả Problem Details như các request khác. */
async function download(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<{ blob: Blob; fileName: string | null }> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), { method: 'GET', credentials: 'include', signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0)
  }
  if (!response.ok) throw new ApiError(response.status, await readProblem(response))
  return { blob: await response.blob(), fileName: fileNameFromDisposition(response.headers.get('Content-Disposition')) }
}

/** Lớp duy nhất gọi mạng (rule frontend.md). Không có DELETE vì dữ liệu nghiệp vụ không bị xóa (BR-DATA-01). */
export const httpClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) => request<T>('PATCH', path, { ...options, body }),
  download,
}
