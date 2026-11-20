import { afterEach, describe, expect, it, vi } from 'vitest'
import { clubRepository } from '@/features/club/model/clubRepository'
import { signInAs } from '@/testUtils'
import { registerJob, runDueJobs } from './mockSchedule'
import { endSession } from './mockSession'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

describe('jobs that run on time (mock)', () => {
  it('runs every job on signed-in requests, and not on signed-out ones', async () => {
    const job = vi.fn()
    cleanups.push(registerJob('đếm', job))
    runDueJobs()
    expect(job).toHaveBeenCalledTimes(1)

    // Một request có thể kiểm phiên nhiều lần nên việc phải tự đánh dấu mốc đã xử lý.
    signInAs('u-anh')
    await clubRepository.getClub('c-guitar')
    const afterSignedIn = job.mock.calls.length
    expect(afterSignedIn).toBeGreaterThan(1)

    endSession()
    await clubRepository.getClub('c-guitar').catch(() => null)
    expect(job).toHaveBeenCalledTimes(afterSignedIn)
  })

  it('keeps running other jobs when one throws, without logging data', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    cleanups.push(
      registerJob('hỏng', () => {
        throw new TypeError('nội dung không được ghi ra')
      }),
    )
    cleanups.push(registerJob('sau', after))
    expect(() => runDueJobs()).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    expect(errorLog).toHaveBeenCalledWith('Việc theo giờ hỏng lỗi: TypeError')
  })

  it('does not run jobs again from inside a job, and stops after being removed', () => {
    const inner = vi.fn()
    const remove = registerJob('lồng', () => {
      inner()
      runDueJobs()
    })
    cleanups.push(remove)
    runDueJobs()
    expect(inner).toHaveBeenCalledTimes(1)
    remove()
    runDueJobs()
    expect(inner).toHaveBeenCalledTimes(1)
  })
})
